/**
 * @see https://firebase.googleblog.com/2016/10/authenticate-your-firebase-users-with.html
 * @see https://github.com/firebase/custom-auth-samples
 * @see http://gavinballard.com/shopify-oauth-flow-for-dummies/
 * @see https://console.firebase.google.com/project/tagged-images/overview
 * @todo https://firebase.google.com/docs/cli/
 * @todo https://github.com/Daplie/node-letsencrypt
 * @see https://github.com/OptimalBits/redbird
 */

'use strict';

const PORT = process.env.PORT || 3050;
var session = require('express-session');
const Firebase = require('firebase-admin');
const express = require('express');
const crypto = require('crypto');
var config = require('./config');
const oauth2 = require('simple-oauth2');

var clientApp = {};
for(var instagramApp in config.instagramApps) {
  var credentials = {
    client: {
      id: config.instagramApps[instagramApp].id,
      secret: config.instagramApps[instagramApp].secret
    },
    auth: {
      tokenHost: config.instagramApps[instagramApp].tokenHost,
      tokenPath: config.instagramApps[instagramApp].tokenPath
    }
  };
  // console.log("shopify instagramApp", instagramApp, credentials);
  clientApp[instagramApp] = oauth2.create(credentials);
  clientApp[instagramApp].callbackPath = config.instagramApps[instagramApp].callbackPath;
  clientApp[instagramApp].scopes = config.instagramApps[instagramApp].scopes;
}

var firebase = {};
if(config.firebase) {
  for(var appName in config.firebase){
    // console.log("firebase appName", appName);

    if(config.firebase[appName] && config.firebase[appName]['service-account']) {
      firebase[appName] = Firebase.initializeApp({
        serviceAccount: config.firebase[appName]['service-account'],
      }, appName);
    } else {
      console.warn("No service-account for firebase found!", appName);
    }
  }
} else {
  console.warn("No Config for firebase found!");
}

var app = express();

// http://expressjs.com/de/guide/using-template-engines.html
app.set('view engine', 'pug');

app.use(session({
  secret: 'RA~9$RLsN3&5svsynjpj+x',
  saveUninitialized: false,
  resave: false
}));

/**
 * To test if this microservice is running
 */
app.get('/hello', function (req, res) {
  res.send('world');
});

app.get('/setup', function (req, res) {

  res.render(`setup`, {apps: config.instagramApps});
});

app.get('/setup/:appName', function (req, res) {
  res.render(`setup/${req.params.appName}`, {appName: req.params.appName});
});

/**
 * Redirects the User to the Instagram authentication consent screen. Also the 'state' session is set for later state
 * verification.
 */
app.get('/redirect/:appName/', function (req, res) {
  //if (req.session.token) return res.send('Token ready to be used: '+req.session.token);

  var appName = req.params.appName; // e.g. shopify or october

  if(!req.session[appName]) {
    req.session[appName] = {};
  }

  //
  // Generate a random nonce.
  //
  var state = crypto.randomBytes(20).toString('hex');

  //
  // Generate the authorization URL. For the sake of simplicity the shop name
  // is fixed here but it can, of course, be passed along with the request and
  // be different for each request.
  //
  // console.log('generate auth url for:', appName);
  var uri = clientApp[appName].authorizationCode.authorizeURL({
    redirect_uri: `https://${req.get('host')}${clientApp[appName].callbackPath}/${appName}`,
    scope: clientApp[appName].scopes,
    state: state
  });

  //
  // Save the nonce in the session to verify it later.
  //
  req.session[appName].state = state;
  // console.log('Redirecting to:', uri);
  res.redirect(uri);
});

/**
 * Exchanges a given Shopify auth code passed in the 'code' URL query parameter for a Firebase auth token.
 * The request also needs to specify a 'state' query parameter which will be checked against the 'state' cookie to avoid
 * Session Fixation attacks.
 * This is meant to be used by Web Clients.
 */
app.get('/instagram-callback/:appName', function (req, res) {
  var state = req.query.state;
  var code = req.query.code;
  var appName = req.params.appName;
  var oldState = req.session[appName].state;
 
  if(!req.session[appName]) {
    req.session[appName] = {};
  }

  // Validate the state.
  if ( typeof state !== 'string' || state !== oldState) {
    console.error('Security checks failed on state', state, oldState);
    return res.status(400).send('Security checks failed on state');
  }

  var redirect_uri = `https://${req.get('host')}${clientApp[appName].callbackPath}/${appName}`;
  // console.log('redirect_uri', redirect_uri);

  //
  // Exchange the authorization code
  // 
  clientApp[appName].authorizationCode.getToken({
    code: req.query.code,
    redirect_uri: redirect_uri,
  }).then(results => {
    // console.log('Auth code exchange result received:', results);
    // We have an Instagram access token and the user identity now.
    const instagramAccessToken = results.access_token;
    const instagramUserID = results.user.id;

    var user = {
      profilePic: results.user.profile_picture,
      fullName: results.user.full_name,
      username: results.user.username,
      website: results.user.website,
      bio: results.user.bio
    }

    // Create a Firebase account and get the Custom Auth Token.
    createFirebaseAccount(appName, instagramUserID, user, instagramAccessToken, function (err, firebaseAuth, instagramAccessToken) {

      if(err) {
        return res.jsonp({
          status: 500,
          message: err
        });
      }

      // If no firebaseAuth is set just return the accessToken without saving the token in firebase
      if(!firebaseAuth || firebaseAuth === null) {
        return res.render(`result/${req.params.appName}`, {appName: req.params.appName, instagramAccessToken: instagramAccessToken});
      }

      req.session[appName].firebaseToken = firebaseAuth.token;
      req.session[appName].firebaseUid = firebaseAuth.uid;
      req.session[appName].instagramToken = token;
      req.session[appName].state = undefined;

      // Serve an HTML page that signs the user in and updates the user profile.
      res.send(signInFirebaseTemplate(req.session[appName].firebaseToken, appName));
    });
    
  });

});

app.get('/token/:appName', function (req, res) {

  var appName = req.params.appName;

  if( req.session[appName] && req.session[appName].firebaseToken ) {
    return res.jsonp({
      firebaseToken: req.session[appName].firebaseToken,
      // firebaseUid: req.session[appName].firebaseUid,
      // instagramToken: req.session[appName].instagramToken
    });
  }

    return res.jsonp({
      status: 404,
      message: 'Not Found'
    });


});

/**
 * Not used fpr shopify, october and instafeed!
 * 
 * Creates a Firebase account with the given user profile and returns a custom auth token allowing
 * signing-in this account.
 * Also saves the accessToken to the datastore at /instagramAccessToken/$uid
 *
 * @returns {Promise<string>} The Firebase custom auth token in a promise.
 */
var createFirebaseAccount = function (appName, instagramID, user, instagramAccessToken, cb) {
  // The UID we'll assign to the user.
  var uid = `instagram:${instagramID}`;

  // Save the access token tot he Firebase Realtime Database.
  if(firebase[appName])  {
    const databaseTask = firebase[appName].database().ref(`/instagramAccessToken/${uid}`).set(instagramAccessToken);

    // Create or update the user account.
    const userCreationTask = firebase[appName].auth().updateUser(uid, {
      displayName: displayName,
      photoURL: photoURL
    }).catch(error => {
      // If user does not exists we create it.
      if (error.code === 'auth/user-not-found') {
        user.uid = uid;
        return firebase[appName].auth().createUser(user);
      }
      return cb(error, null);
    }).then(firebaseToken => {
       return cb(null, firebaseToken, instagramAccessToken);
    });
  } else {
    console.warn(`no firebase app for ${appName}`);
    return cb(null, null, instagramAccessToken);
  }
}

var getclientAppUrl = function (shop, apiKey) {
  return 'https://'+shop+'/admin/apps/'+apiKey
}

/**
 * Not used fpr shopify, october and instafeed!
 * 
 * Generates the HTML template that:
 *  - Signs the user in Firebase using the given token
 *  - Updates the user profile with shop
 *  - Saves the Shopify AccessToken to the Realtime Database
 *  - Closes the popup
 */
var signInFirebaseTemplate = function (firebaseToken, appName) {
  return `
    <script src="https://www.gstatic.com/firebasejs/3.6.2/firebase.js"></script>
    <script>
      var firebaseToken = '${firebaseToken}';
      var config = {
        apiKey: '${config.firebase[appName].apiKey}'
      };
      var app = firebase.initializeApp(config);
      app.auth().signInWithCustomToken(firebaseToken).then(function() {
        window.close();
      });
    </script>`;
}

app.listen(PORT, function () {
  console.log('Open http://localhost:'+PORT+'/hello or https://dev.instagram.api.jumplink.eu/hello in your browser');
});
