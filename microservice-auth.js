'use strict';

var session = require('express-session');
var ShopifyToken = require('shopify-token');
var express = require('express');

// Path to the OAuth handlers.
const OAUTH_REDIRECT_PATH = '/redirect/:shopname';
const OAUTH_CALLBACK_PATH = '/shopify-callback';

var config = require('./config');

// Shopify App OAuth 2 setup
config.shopifyapp.taggedimages.redirectUri = 'https://shopify.api.jumplink.eu'+OAUTH_CALLBACK_PATH
var shopifyToken = new ShopifyToken(config.shopifyapp.taggedimages);

// Firebase Setup
const firebase = require('firebase');
firebase.initializeApp({
  serviceAccount: config.firebase.taggedimages['service-account']
});


var app = express();

app.use(session({
  secret: 'eo3Athuo4Ang5gai',
  saveUninitialized: false,
  resave: false
}));

app.get('/hello', function (req, res) {
  res.send('world');
});

/**
 * Redirects the User to the Shopify authentication consent screen. Also the 'state' cookie is set for later state
 * verification.
 */
app.get(OAUTH_REDIRECT_PATH, function (req, res) {
  //if (req.session.token) return res.send('Token ready to be used: '+req.session.token);

  //
  // Generate a random nonce.
  //
  var state = shopifyToken.generateNonce();

  //
  // Generate the authorization URL. For the sake of simplicity the shop name
  // is fixed here but it can, of course, be passed along with the request and
  // be different for each request.
  //
  console.log('generate auth url for:', req.params.shopname);
  var uri = shopifyToken.generateAuthUrl(req.params.shopname, config.shopifyapp.taggedimages.scopes, state);

  //
  // Save the nonce in the session to verify it later.
  //
  req.session.state = state;
  console.log('Redirecting to:', uri);
  res.redirect(uri);
});

/**
 * Exchanges a given Shopify auth code passed in the 'code' URL query parameter for a Firebase auth token.
 * The request also needs to specify a 'state' query parameter which will be checked against the 'state' cookie to avoid
 * Session Fixation attacks.
 * This is meant to be used by Web Clients.
 */
app.get(OAUTH_CALLBACK_PATH, function (req, res) {
  var state = req.query.state;

  if (
      typeof state !== 'string'
    || state !== req.session.state          // Validate the state.
    || !shopifyToken.verifyHmac(req.query)  // Validare the hmac.
  ) {
    return res.status(400).send('Security checks failed');
  }

  //
  // Exchange the authorization code for a permanent access token.
  //
  shopifyToken.getAccessToken(req.query.shop, req.query.code, function (err, token) {
    if (err) {
      console.error(err.stack);
      return res.status(500).send('Oops, something went wrong');
    }

    console.log('Resive Token:',token);

    const firebaseToken = createFirebaseToken(req.query.shop);

    req.session.firebaseToken = firebaseToken;
    req.session.shopifyToken = token;
    req.session.state = undefined;

    // Serve an HTML page that signs the user in and updates the user profile.
    res.send(signInFirebaseTemplate(firebaseToken, req.query.shop, token));
  });
});

app.get('/tokens', function (req, res) {
  res.jsonp({
	firebaseToken: req.session.firebaseToken,
        shopifyToken: req.session.shopifyToken
  });
});

/**
 * Creates a Firebase custom auth token for the given Shopify user ID.
 *
 * @returns {Object} The Firebase custom auth token and the uid.
 */
var createFirebaseToken = function (shopifyStoreName) {
  // The UID we'll assign to the user.
  const uid = `shopify:${shopifyStoreName.replace(/\./g, '-')}`; // replace . (dot) with - (minus) because: Paths must be non-empty strings and can't contain ".", "#", "$", "[", or "]"

  // Create the custom token.
  const token = firebase.auth().createCustomToken(uid);
  console.log('Created Custom token for UID "', uid, '" Token:', token);
  return token;
}

var getShopifyAppUrl = function (shop, apiKey) {
  return 'https://'+shop+'/admin/apps/'+apiKey
}

/**
 * Generates the HTML template that:
 *  - Signs the user in Firebase using the given token
 *  - Updates the user profile with shop
 *  - Saves the Shopify AccessToken to the Realtime Database
 *  - Closes the popup
 */
var signInFirebaseTemplate = function (token, shop, shopifyAccessToken) {
  return `
    <script src="https://www.gstatic.com/firebasejs/3.4.1/firebase.js"></script>
    <script src="promise.min.js"></script><!-- Promise Polyfill for older browsers -->
    <script>
      var token = '${token}';
      var config = {
        apiKey: '${config.firebase.taggedimages.apiKey}',
        databaseURL: 'https://${config.firebase.taggedimages["service-account"].project_id}.firebaseio.com'
      };
      // We sign in via a temporary Firebase app to update the profile.
      var tempApp = firebase.initializeApp(config, '_temp_');
      tempApp.auth().signInWithCustomToken(token).then(function(user) {
        console.log("user", user);

        // Saving the Shopify API access token in the Realtime Database.
        const tasks = [tempApp.database().ref('/shopifyAccessToken/' + user.uid).set('${shopifyAccessToken}')];

        // Updating the shop if needed.
        if ('${shop}' !== user.shop) {
          tasks.push(user.updateProfile({shop: '${shop}'}));
        }

        // Wait for completion of above tasks.
        return Promise.all(tasks).then(function() {
          // Delete temporary Firebase app and sign in the default Firebase app, then close the popup.
          var defaultApp = firebase.initializeApp(config);
          Promise.all([tempApp.delete(), defaultApp.auth().signInWithCustomToken(token)]).then(function() {
            //window.close();
            window.location.href = '${getShopifyAppUrl(shop, config.shopifyapp.taggedimages.apiKey)}';
            //window.location.href = 'https://tagged-images.jumplink.eu/shopify?token=${shopifyAccessToken}?shop=${shop}';
          });
        });
      });
    </script>`;
}

app.listen(8080, function () {
  console.log('Open http://localhost:8080 in your browser');
});
