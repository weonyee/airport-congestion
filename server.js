const http  = require('http');
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

const PORT        = 3000;
const SERVICE_KEY = 'd6f1160f87e2b8be611d1080eb087cd41d2d36771ce52942133f00b2c6305968';
const API_BASE    = 'https://apis.data.go.kr/B551177/StatusOfArrivals/getArrivalsCongestion';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // ── /api/congestion → 공공데이터 API 프록시 ──────────────────────────
  if (parsed.pathname === '/api/congestion') {
    const q = parsed.query;
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      numOfRows:  q.numOfRows  || '200',
      pageNo:     q.pageNo     || '1',
      from_time:  q.from_time  || '0000',
      to_time:    q.to_time    || '2400',
      type:       'json',
    });

    const apiUrl = `${API_BASE}?${params.toString()}`;

    https.get(apiUrl, (apiRes) => {
      let body = '';
      apiRes.on('data', chunk => body += chunk);
      apiRes.on('end', () => {
        res.writeHead(200, {
          'Content-Type':                'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control':               'no-store',
        });
        res.end(body);
      });
    }).on('error', (err) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // ── 정적 파일 서빙 ────────────────────────────────────────────────────
  let filePath = path.join(__dirname, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
  const ext    = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✈  인천공항 입국장 현황 서버 실행 중`);
  console.log(`   http://localhost:${PORT}\n`);
});
