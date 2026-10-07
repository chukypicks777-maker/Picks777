import { gzipSync } from 'node:zlib';

// Polled calendars are hundreds of kilobytes of repetitive JSON. Vercel's CDN
// compresses function responses itself; other hosts (Render, Railway, Docker)
// receive gzip here.
export function compressJson(req, res, next) {
  if (process.env.VERCEL || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
  const json = res.json.bind(res);
  res.json = body => {
    const text = JSON.stringify(body);
    if (text === undefined || Buffer.byteLength(text) < 1400 || res.getHeader('Content-Encoding')) return json(body);
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return res.send(gzipSync(text, { level: 6 }));
  };
  next();
}
