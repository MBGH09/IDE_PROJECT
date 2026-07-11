import http from 'http';

const url = 'http://172.18.0.3:5173';
http.get(url, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => console.log('BODY: ' + chunk.toString().substring(0, 100)));
}).on('error', (e) => {
  console.error(`ERROR: ${e.message}`);
});
