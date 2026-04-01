(function () {
  'use strict';

  // 프록시 서버를 통해 CORS 우회 (server.js 실행 필요)
  const API_BASE = '/api/congestion';

  // 혼잡도 임계값 (korean + foreigner 합산)
  const THRESH = { LOW: 10, MEDIUM: 30 };

  // 입국장 정렬 순서 (실제 데이터에 있는 것만 표시)
  const GATE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];

  let allFlights   = [];
  let selectedGate = null; // { terminal, gate }
  let activeTerminal = '';

  // ── DOM ──────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const dom = {
    clock:        $('clock'),
    timeRange:    $('time-range-label'),
    loading:      $('loading'),
    error:        $('error'),
    errorMsg:     $('error-msg'),
    mainContent:  $('main-content'),
    termBoards:   $('terminal-boards'),
    detailPanel:  $('detail-panel'),
    detailTitle:  $('detail-title'),
    detailStats:  $('detail-stats'),
    detailBody:   $('detail-body'),
    detailClose:  $('detail-close'),
    lastUpdated:  $('last-updated'),
    refreshBtn:   $('refresh-btn'),
    retryBtn:     $('retry-btn'),
  };

  // ── 시계 ─────────────────────────────────────────────────────────────────
  function tickClock() {
    dom.clock.textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ── 시간 윈도우 ───────────────────────────────────────────────────────────
  function getTimeWindow() {
    const now  = new Date();
    const from = new Date(now - 2 * 3600 * 1000);
    const to   = new Date(now + 2 * 3600 * 1000);
    const hhmm = d => String(d.getHours()).padStart(2,'0') + String(d.getMinutes()).padStart(2,'0');
    const label = d => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return { from: hhmm(from), to: hhmm(to), label: `${label(from)} ~ ${label(to)}` };
  }

  // ── 유틸 ─────────────────────────────────────────────────────────────────
  function formatTime(raw) {
    if (!raw) return '-';
    const s = String(raw).replace(/\D/g, '');
    if (s.length >= 12) return s.slice(8,10) + ':' + s.slice(10,12);
    if (s.length === 4)  return s.slice(0,2)  + ':' + s.slice(2,4);
    return raw;
  }

  function sanitize(v) {
    const el = document.createElement('span');
    el.textContent = String(v ?? '-');
    return el.innerHTML;
  }

  function congestionLevel(total) {
    const n = Number(total) || 0;
    if (n === 0)           return { level: 'empty',  label: '-',  pct: 0 };
    if (n < THRESH.LOW)    return { level: 'low',    label: '원활', pct: Math.min(n / THRESH.LOW * 35, 35) };
    if (n < THRESH.MEDIUM) return { level: 'medium', label: '보통', pct: 35 + (n - THRESH.LOW) / (THRESH.MEDIUM - THRESH.LOW) * 40 };
    return { level: 'high', label: '혼잡', pct: Math.min(75 + (n - THRESH.MEDIUM) / 20 * 25, 100) };
  }

  // ── API 호출 ──────────────────────────────────────────────────────────────
  async function fetchAll() {
    showLoading();
    const win = getTimeWindow();
    dom.timeRange.textContent = `조회 범위 ${win.label} (±2시간)`;

    // T2는 현재 API에서 데이터 미제공
    if (activeTerminal === 'T2') {
      dom.loading.style.display     = 'none';
      dom.error.style.display       = 'none';
      dom.mainContent.style.display = 'block';
      dom.termBoards.innerHTML = `
        <div class="coming-soon">
          <div class="coming-soon-icon">🚧</div>
          <div class="coming-soon-title">제2터미널 서비스 준비 중</div>
          <div class="coming-soon-sub">T2 Terminal — Coming Soon</div>
          <div class="coming-soon-desc">제2터미널 입국장 혼잡도 서비스는 현재 준비 중입니다.<br/>빠른 시일 내에 제공될 예정입니다.</div>
        </div>`;
      dom.detailPanel.style.display = 'none';
      return;
    }

    const params = new URLSearchParams({
      numOfRows: '200',
      pageNo:    '1',
      from_time: win.from,
      to_time:   win.to,
    });

    try {
      const res  = await fetch(`${API_BASE}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      allFlights = extractItems(data);

      renderBoards();
      dom.lastUpdated.textContent = new Date().toLocaleTimeString('ko-KR');
      dom.loading.style.display = 'none';
      dom.error.style.display   = 'none';
      dom.mainContent.style.display = 'block';

      if (selectedGate) renderDetail(selectedGate.terminal, selectedGate.gate);

    } catch (err) {
      dom.loading.style.display = 'none';
      dom.error.style.display   = 'block';
      dom.errorMsg.textContent  = err.message || '데이터를 불러올 수 없습니다.';
    }
  }

  function extractItems(data) {
    try {
      const items = data?.response?.body?.items;
      if (!items) return [];
      if (Array.isArray(items))      return items;
      if (Array.isArray(items.item)) return items.item;
      if (items.item)                return [items.item];
      return [];
    } catch { return []; }
  }

  // ── 보드 렌더링 ───────────────────────────────────────────────────────────
  function renderBoards() {
    // 터미널 목록 추출
    const terminals = activeTerminal
      ? [activeTerminal]
      : [...new Set(allFlights.map(f => f.terno || '미정'))].sort();

    dom.termBoards.innerHTML = terminals.map(t => buildTerminalBoard(t)).join('');

    // 슬롯 클릭 이벤트
    dom.termBoards.querySelectorAll('.gate-slot').forEach(el => {
      el.addEventListener('click', () => {
        const gate = el.dataset.gate;
        const term = el.dataset.terminal;

        // 같은 슬롯 재클릭 시 닫기
        if (selectedGate && selectedGate.gate === gate && selectedGate.terminal === term) {
          closeDetail();
          return;
        }

        // 이전 선택 해제
        dom.termBoards.querySelectorAll('.gate-slot.selected').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');

        selectedGate = { terminal: term, gate };
        renderDetail(term, gate);
      });
    });
  }

  function buildTerminalBoard(terminal) {
    const flights = allFlights.filter(f => (f.terno || '미정') === terminal);

    // 게이트별 집계 (A~F 전체 고정)
    const gateMap = {};
    GATE_ORDER.forEach(g => { gateMap[g] = { korean: 0, foreign: 0, count: 0, active: false }; });

    flights.forEach(f => {
      const g = (f.entrygate || '').toUpperCase();
      if (!gateMap[g]) return;
      gateMap[g].korean  += parseFloat(f.korean    || 0);
      gateMap[g].foreign += parseFloat(f.foreigner || 0);
      gateMap[g].count++;
      gateMap[g].active = true;
    });

    const totalWait = flights.reduce((s, f) => s + parseFloat(f.korean || 0) + parseFloat(f.foreigner || 0), 0);
    const { level: tLevel, label: tLabel } = congestionLevel(totalWait);

    const slots = GATE_ORDER.map(g => {
      const d = gateMap[g];

      // 운영 중이지 않은 입국장
      if (!d.active) {
        return `
          <div class="gate-slot level-inactive">
            <div class="gate-slot-letter">${g}</div>
            <div class="gate-slot-label">입국장</div>
            <div class="gate-slot-inactive-msg">현재 운영 중이지 않습니다</div>
          </div>`;
      }

      const total = d.korean + d.foreign;
      const { level, label, pct } = congestionLevel(total);
      const korPct = total > 0 ? (d.korean / total * 100).toFixed(0) : 0;

      return `
        <div class="gate-slot level-${level}" data-gate="${g}" data-terminal="${terminal}">
          <div class="gate-slot-letter">${g}</div>
          <div class="gate-slot-label">입국장</div>
          <div class="gate-slot-count">${Math.round(total)}</div>
          <div class="gate-slot-unit">명 대기</div>
          <div class="gate-slot-level">${label}</div>
          <div class="gate-slot-flights">${d.count}편 도착</div>
          <div class="gate-mini-bar">
            <div class="gate-mini-bar-fill" style="width:${korPct}%"></div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="terminal-board">
        <div class="terminal-board-header">
          <span class="terminal-name-badge">${sanitize(terminal)}</span>
          <span class="terminal-board-title">${terminal === 'T1' ? '제1터미널' : terminal === 'T2' ? '제2터미널' : terminal}</span>
          <div class="terminal-summary">
            총 대기 <strong style="color:#00d4ff">${Math.round(totalWait)}명</strong> &nbsp;·&nbsp;
            <span style="color:${tLevel==='low'?'#68d391':tLevel==='medium'?'#f6ad55':'#fc8181'}">${tLabel}</span>
            &nbsp;·&nbsp; ${flights.length}편
          </div>
        </div>
        <div class="gate-row">${slots}</div>
      </div>`;
  }

  // ── 상세 패널 ─────────────────────────────────────────────────────────────
  function renderDetail(terminal, gate) {
    const flights = allFlights
      .filter(f => (f.terno || '') === terminal && (f.entrygate || '').toUpperCase() === gate)
      .sort((a, b) => String(a.scheduletime || '').localeCompare(String(b.scheduletime || '')));

    const totalKorean  = flights.reduce((s, f) => s + parseFloat(f.korean    || 0), 0);
    const totalForeign = flights.reduce((s, f) => s + parseFloat(f.foreigner || 0), 0);
    const totalWait    = totalKorean + totalForeign;
    const { level, label } = congestionLevel(totalWait);

    dom.detailTitle.textContent = `${terminal} · 입국장 ${gate} 상세 현황`;

    dom.detailStats.innerHTML = `
      <div class="detail-stat">
        <div class="detail-stat-value">${Math.round(totalWait)}</div>
        <div class="detail-stat-label">총 대기인원</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value">${Math.round(totalKorean)}</div>
        <div class="detail-stat-label">내국인</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value">${Math.round(totalForeign)}</div>
        <div class="detail-stat-label">외국인</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value">${flights.length}</div>
        <div class="detail-stat-label">도착 항공편</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value"><span class="badge ${level}">${label}</span></div>
        <div class="detail-stat-label">혼잡도</div>
      </div>`;

    if (flights.length === 0) {
      dom.detailBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#718096;padding:24px">해당 입국장 도착편 없음</td></tr>`;
    } else {
      dom.detailBody.innerHTML = flights.map(f => {
        const k = parseFloat(f.korean    || 0);
        const r = parseFloat(f.foreigner || 0);
        const t = k + r;
        const { level: fl, label: flabel } = congestionLevel(t);
        return `<tr>
          <td>${sanitize(f.flightid || '-')}</td>
          <td>${sanitize(f.airport  || '-')}</td>
          <td>${sanitize(f.gatenumber || '-')}</td>
          <td>${formatTime(f.scheduletime)}</td>
          <td>${formatTime(f.estimatedtime)}</td>
          <td>${Math.round(k)}</td>
          <td>${Math.round(r)}</td>
          <td><span class="badge ${fl}">${flabel}</span></td>
        </tr>`;
      }).join('');
    }

    dom.detailPanel.style.display = 'block';
    dom.detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeDetail() {
    selectedGate = null;
    dom.detailPanel.style.display = 'none';
    dom.termBoards.querySelectorAll('.gate-slot.selected').forEach(s => s.classList.remove('selected'));
  }

  // ── UI 상태 ───────────────────────────────────────────────────────────────
  function showLoading() {
    dom.loading.style.display     = 'flex';
    dom.error.style.display       = 'none';
    dom.mainContent.style.display = 'none';
  }

  // ── 이벤트 ────────────────────────────────────────────────────────────────
  dom.refreshBtn.addEventListener('click', fetchAll);
  dom.retryBtn.addEventListener('click', fetchAll);
  dom.detailClose.addEventListener('click', closeDetail);

  // 터미널 탭
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTerminal = btn.dataset.terminal || '';
      closeDetail();
      fetchAll();
    });
  });

  // 초기 로드 + 60초 자동 갱신
  fetchAll();
  setInterval(fetchAll, 60000);
})();
