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

var session = require('express-session');
var ShopifyToken = require('shopify-token');
const Firebase = require('firebase');
var express = require('express');
var config = require('./config');

var shopifyApp = {};
for(var appName in config.shopifyapp){
  console.log("shopify appName", appName);
  shopifyApp[appName] = new ShopifyToken(config.shopifyapp[appName]);
}

var firebase = {};
for(var appName in config.firebase){
  console.log("firebase appName", appName);

  firebase[appName] = Firebase.initializeApp({
    serviceAccount: config.firebase[appName]['service-account'],
  }, appName);
}

var app = express();

app.use(session({
  secret: 'eo3Athuo4Ang5gai',
  saveUninitialized: false,
  resave: false
}));

/**
 * Get CURRENT_LOGGED_IN_SHOP from CURRENT_LOGGED_IN_SHOP.myshopify.com
 */
var getShopName = function (shop) {
  return shop.substring(0, shop.indexOf("."));
};

/**
 * To test if this microservice is running
 */
app.get('/hello', function (req, res) {
  res.send('world');
});

/**
 * Redirects the User to the Shopify authentication consent screen. Also the 'state' session is set for later state
 * verification.
 */
app.get('/redirect/:appName/:shopName', function (req, res) {
  //if (req.session.token) return res.send('Token ready to be used: '+req.session.token);

  var appName = req.params.appName;
  var shopName = req.params.shopName;

  if(!req.session[shopName]) {
    req.session[shopName] = {};
  }
 
  if(!req.session[shopName][appName]) {
    req.session[shopName][appName] = {};
  }

  //
  // Generate a random nonce.
  //
  var state = shopifyApp[appName].generateNonce();

  //
  // Generate the authorization URL. For the sake of simplicity the shop name
  // is fixed here but it can, of course, be passed along with the request and
  // be different for each request.
  //
  console.log('generate auth url for:', shopName);
  var uri = shopifyApp[appName].generateAuthUrl(shopName, config.shopifyapp[appName].scopes, state);

  //
  // Save the nonce in the session to verify it later.
  //
  req.session[shopName][appName].state = state;
  console.log('Redirecting to:', uri);
  res.redirect(uri);
});

/**
 * Exchanges a given Shopify auth code passed in the 'code' URL query parameter for a Firebase auth token.
 * The request also needs to specify a 'state' query parameter which will be checked against the 'state' cookie to avoid
 * Session Fixation attacks.
 * This is meant to be used by Web Clients.
 */
app.get('/shopify-callback/:appName', function (req, res) {
  var state = req.query.state;
  var appName = req.params.appName;

  console.log("req.query", req.query);
  var shopName = getShopName(req.query.shop);

  if(!req.session[shopName]) {
    req.session[shopName] = {};
  }
 
  if(!req.session[shopName][appName]) {
    req.session[shopName][appName] = {};
  }

  if (
      typeof state !== 'string'
    || state !== req.session[shopName][appName].state          // Validate the state.
    || !shopifyApp[appName].verifyHmac(req.query)  // Validare the hmac.
  ) {
    return res.status(400).send('Security checks failed');
  }

  //
  // Exchange the authorization code for a permanent access token.
  //
  shopifyApp[appName].getAccessToken(req.query.shop, req.query.code, function (err, token) {
    if (err) {
      console.error(err.stack);
      return res.status(500).send('Oops, something went wrong');
    }

    console.log('Resive Token:',token);

    var firebaseAuth = createFirebaseCustomAuth(appName, req.query.shop);

    req.session[shopName][appName].firebaseToken = firebaseAuth.token;
    req.session[shopName][appName].firebaseUid = firebaseAuth.uid;
    req.session[shopName][appName].shopifyToken = token;
    req.session[shopName][appName].state = undefined;

    // Serve an HTML page that signs the user in and updates the user profile.
    res.send(signInFirebaseTemplate(req.session[shopName][appName].firebaseToken, req.query.shop, token));
  });
});

app.get('/token/:appName/:shopName', function (req, res) {

  var appName = req.params.appName;
  var shopName = req.params.shopName;

  if( req.session[shopName] && req.session[shopName][appName] && req.session[shopName][appName].firebaseToken ) {
    return res.jsonp({
      firebaseToken: req.session[shopName][appName].firebaseToken,
      // firebaseUid: req.session[shopName][appName].firebaseUid,
      // shopifyToken: req.session[shopName][appName].shopifyToken
    });
  }

    return res.jsonp({
      status: 404,
      message: 'Not Found'
    });


});

/**
 * Creates a Firebase custom auth token for the given Shopify user ID.
 *
 * @returns {Object} The Firebase custom auth token and the uid.
 */
var createFirebaseCustomAuth = function (appName, shopifyStore) {
  // The UID we'll assign to the user.
  var uid = `shopify:${shopifyStore.replace(/\./g, '-')}`; // replace . (dot) with - (minus) because: Paths must be non-empty strings and can't contain ".", "#", "$", "[", or "]"

  // Create the custom token.
  var token = firebase[appName].auth().createCustomToken(uid);
  console.log('Created Custom token for UID "', uid, '" Token:', token);
  return {
    token: token,
    uid: uid,
  };
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
    <script>
      /*
       * Promise Polyfill for older browsers
       * @see https://github.com/taylorhakes/promise-polyfill
       */
      !function(e){function n(){}function t(e,n){return function(){e.apply(n,arguments)}}function o(e){if("object"!=typeof this)throw new TypeError("Promises must be constructed via new");if("function"!=typeof e)throw new TypeError("not a function");this._state=0,this._handled=!1,this._value=void 0,this._deferreds=[],s(e,this)}function i(e,n){for(;3===e._state;)e=e._value;return 0===e._state?void e._deferreds.push(n):(e._handled=!0,void o._immediateFn(function(){var t=1===e._state?n.onFulfilled:n.onRejected;if(null===t)return void(1===e._state?r:u)(n.promise,e._value);var o;try{o=t(e._value)}catch(i){return void u(n.promise,i)}r(n.promise,o)}))}function r(e,n){try{if(n===e)throw new TypeError("A promise cannot be resolved with itself.");if(n&&("object"==typeof n||"function"==typeof n)){var i=n.then;if(n instanceof o)return e._state=3,e._value=n,void f(e);if("function"==typeof i)return void s(t(i,n),e)}e._state=1,e._value=n,f(e)}catch(r){u(e,r)}}function u(e,n){e._state=2,e._value=n,f(e)}function f(e){2===e._state&&0===e._deferreds.length&&o._immediateFn(function(){e._handled||o._unhandledRejectionFn(e._value)});for(var n=0,t=e._deferreds.length;n<t;n++)i(e,e._deferreds[n]);e._deferreds=null}function c(e,n,t){this.onFulfilled="function"==typeof e?e:null,this.onRejected="function"==typeof n?n:null,this.promise=t}function s(e,n){var t=!1;try{e(function(e){t||(t=!0,r(n,e))},function(e){t||(t=!0,u(n,e))})}catch(o){if(t)return;t=!0,u(n,o)}}var a=setTimeout;o.prototype["catch"]=function(e){return this.then(null,e)},o.prototype.then=function(e,t){var o=new this.constructor(n);return i(this,new c(e,t,o)),o},o.all=function(e){var n=Array.prototype.slice.call(e);return new o(function(e,t){function o(r,u){try{if(u&&("object"==typeof u||"function"==typeof u)){var f=u.then;if("function"==typeof f)return void f.call(u,function(e){o(r,e)},t)}n[r]=u,0===--i&&e(n)}catch(c){t(c)}}if(0===n.length)return e([]);for(var i=n.length,r=0;r<n.length;r++)o(r,n[r])})},o.resolve=function(e){return e&&"object"==typeof e&&e.constructor===o?e:new o(function(n){n(e)})},o.reject=function(e){return new o(function(n,t){t(e)})},o.race=function(e){return new o(function(n,t){for(var o=0,i=e.length;o<i;o++)e[o].then(n,t)})},o._immediateFn="function"==typeof setImmediate&&function(e){setImmediate(e)}||function(e){a(e,0)},o._unhandledRejectionFn=function(e){"undefined"!=typeof console&&console&&console.warn("Possible Unhandled Promise Rejection:",e)},o._setImmediateFn=function(e){o._immediateFn=e},o._setUnhandledRejectionFn=function(e){o._unhandledRejectionFn=e},"undefined"!=typeof module&&module.exports?module.exports=o:e.Promise||(e.Promise=o)}(this);

      var token = '${token}';
      var config = {
        apiKey: '${config.firebase[appName].apiKey}',
        databaseURL: 'https://${config.firebase[appName]["service-account"].project_id}.firebaseio.com'
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
            window.location.href = '${getShopifyAppUrl(shop, config.shopifyapp[appName].apiKey)}';
          });
        });
      });
    </script>`;
}

app.listen(8080, function () {
  console.log('Open http://localhost:8080/hello or https://auth.api.jumplink.eu/hello in your browser');
});
