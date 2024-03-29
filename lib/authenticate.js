/**
 * @file authenicate.js
 * 
 * This file manages the authenication to Google APIs using OAuth2.
 * 
 * Additional reading: 
 * https://developers.google.com/identity/protocols/oauth2
 * 
 */
const credentials = require('../credentials.json');

const fs = require('fs');
const http = require('http');
const url = require('url');
const opn = require('open');
const axios = require('axios');
const destroyer = require('server-destroy');

const {google} = require('googleapis');
const Photos = require('googlephotos');

const scopes = [
  Photos.Scopes.READ_ONLY,
  Photos.Scopes.SHARING
];
const oauth2Client = new google.auth.OAuth2(
  credentials.web.client_id,
  credentials.web.client_secret,
  credentials.web.redirect_uris[0]
);
const authorizeUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes.join(' '),
});   
const AUTH_FILE = "./auth.json";

/**
 * Retrives the contents inside the auth.json file.
 * @returns Object containing the contents of auth.json file
 */
const readAuthToken = () => {
  let auth = JSON.parse(fs.readFileSync(AUTH_FILE));

  // Token still not expired.
  if (auth.expiry_date > Date.now()) {
    auth.isExpired = true;
  }
  
  else {
    auth.isExpired = false;
  }

  return auth;
};

/**
 * Saves the authenication tokens to a file stored locally in the repo. This file will not be commited to the repo.
 * @param {Object} tokens authenication tokens provided by Google OAuth2
 */
const saveAuthTokens = (tokens) => {
  fs.writeFile(AUTH_FILE, JSON.stringify(tokens, null, 2), "utf-8", err => {
    if (err) {
      console.error('ERR-AUTH-001: Unable to save authentication tokens locally', err);
      return;
    }
  
    console.log('AUTH: Saved authentication tokens');
  });
};

/**
 * Authenticates to Google using OAuth2 on a local URI.
 * @returns Promise
 */
const authenticate = () => {
  console.log("AUTH: Authentication required to proceed");

  return new Promise((resolve, reject) => {
 
    const server = http
      .createServer(async (req, res) => {
        try {
          if (req.url.indexOf('/oauth2callback') > -1) {
            const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
            res.end('Authentication successful! Return to the console/terminal.');
            server.destroy();

            // Retrieve and store token.
            const {tokens} = await oauth2Client.getToken(qs.get('code'));
            oauth2Client.credentials = tokens;
            saveAuthTokens(tokens);

            // Access Google Photos API with token.
            resolve({
              access_token: tokens.access_token
            });
          } 
        } catch (e) {
          reject(e);
        }
      })
      .listen(3000, async () => {
        // Open the browser to the authorize url to start the workflow
        opn(authorizeUrl, {wait: false}).then(cp => cp.unref());
      });

    destroyer(server);
  });
}

/**
 * Reauthenticate the user using the refresh token.
 * @param {String} refresh_token token to generate a new authenication token 
 * @returns Promise
 */
const reauthenticate = (refresh_token) => {
  console.log("AUTH: Re-authenticating with refresh token");

  return new Promise(async (resolve, reject) => {
    // 
    // More info: 
    // https://developers.google.com/identity/protocols/oauth2/web-server#offline
    // 
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      client_id:  credentials.web.client_id,
      client_secret: credentials.web.client_secret,
      grant_type: "refresh_token",
      refresh_token: refresh_token
    });

    resolve({
      access_token: response.data.access_token
    });
  });
}

/**
 * Returns an access token to gain access to Google APIs using OAuth2.
 * @returns Promise
 */
const getAccessToken = () => {
  return new Promise(async resolve => {

    // For first time users, authenicate via oAuth2.
    if (!fs.existsSync(AUTH_FILE)) {
      authenticate()
      .then(response => {
        resolve(response.access_token);
      });

      return;
    }

    const {access_token, refresh_token, isExpired} = readAuthToken();
    if (fs.existsSync(AUTH_FILE) && !isExpired) {
      const response = await reauthenticate(refresh_token);
      resolve(response.access_token);
      return;
    }

    else {
      console.log("AUTH: Using current access token");
      resolve(access_token);
    }

  });
}

module.exports = {
  getAccessToken: getAccessToken
};