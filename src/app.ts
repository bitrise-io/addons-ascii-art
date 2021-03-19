import express from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

app.get('/', (req, res) => {
  res.send('Welcome to ASCII art');
});

app.post('/provision', (req, res) => {
  const token = getToken(req)

  if (!token) {
    res.status(401).send({ code: 400, message: 'invalid token in Authorization header' });
    return;
  }

  const params = new URLSearchParams({
    'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
    'client_id': clientID,
    'client_secret': clientSecret,
    'subject_token': token,
    'requested_token_type': 'urn:ietf:params:oauth:token-type:refresh_token'
  });

  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  axios.post('https://auth.services.bitrise.dev/auth/realms/addons/protocol/openid-connect/token', params, config).then(function (response) {
    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    console.log({'accessToken': accessToken, 'refreshToken': refreshToken});

    res.sendStatus(200)
  }).catch(function (error) {
    res.status(error.response.status).send(error.response.data);
  });
});

app.post('/login', (req, res) => {
  res.send('hi meercode');
});

app.delete('/provision/{app_slug}', (req, res) => {
});

app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});

let getToken = (req: any): string | undefined => {
  const bearerPrefixLen = 'bearer '.length
  let token = req.headers.authorization

  if (!token || token.length < bearerPrefixLen) {
    return undefined;
  }

  return token.substr(bearerPrefixLen);
}