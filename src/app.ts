import express from 'express';

const app = express();
const port = process.env.PORT || 3000;
 
app.get('/', (req, res) => {
  res.send('Welcome to ASCII art');
});

app.post('/provision', (req, res) => {
  res.sendStatus(200);
});

app.post('/login', (req, res) => {
  res.send('hi meercode');
});

app.delete('/provision/{app_slug}', (req, res) => {
});

app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});