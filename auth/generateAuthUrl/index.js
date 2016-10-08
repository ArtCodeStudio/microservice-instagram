// var BackandSDK = require('backandsdk/backand');
// var backand = new BackandSDK();

var ShopifyToken = require('shopify-token');

exports.backandCallback = function(dbRow, parameters, userProfile, response) {
    // README - Here is the starting point of your code.
    // Do not change the signature of backandCallback.
    // Do not exit anywhere from your code, meaning, do not use process.exit
    // Backand will take care of that for you
    // You should call the response callback: function(err, data) { ... }
    // err (Error): The error object returned from the request. Set to null if the request is successful.
    // data (Object): The de-serialized data returned from the request. Set to null if a request error occurs.
    
    // Bellow is an example of how to handle success and failure of your code

    var runBackandSDKDemo = false;

    if (runBackandSDKDemo) {
        backandCrudDemo()
        .then(function(result) {
            /* response to exist the action */ response(null, {"message": "Backand SDK Demo Finished"})
        });
    }
    else {

        console.log(parameters.storeName);

      // error handling
        if (!parameters.storeName) {
            return response({errorMessage: "No store name defined"}, null);
        }

        var shopifyToken = new ShopifyToken({
            "redirectUri": "http://localhost:3000/login-callback.html",
            "sharedSecret": "3356c250642e10e30cc112b90e1c4dcf",
            "apiKey": "08267a137ead223d3dedfc4fe9f6c466",
            "shop": parameters.storeName
        });

        //
        // Generate a random nonce.
        //
        var nonce = shopifyToken.generateNonce();

        //
        // Generate the authorization URL. For the sake of simplicity the shop name
        // is fixed here but it can, of course, be passed along with the request and
        // be different for each request.
        //
        var uri = shopifyToken.generateAuthUrl(parameters.storeName, undefined, nonce);

        // a response data example
        var payload = {
            "authUrl": uri,
            "nonce": nonce
        };

  
        // success handling
        response(null, payload);
    }
}

// To run a demo of how to perform CRUD (Create, Read, Update and Delete) with Backand SDK, do the following:
// 1. npm install backandsdk --save
// 2. Change runBackandSDKDemo to true
// 3. Uncomment the function backandCrudDemo and the two first variables BackandSDK and backand
// 4. Uncomment the call for the function backandCrudDemo

// function backandCrudDemo(){
//
//     var masterToken = "b50a5125-769c-472f-9287-6ba227818f2e"; //<put here the master token that you run in the action init>;
//     var userToken = "83d0f58e-f60d-11e5-b112-0ed7053426cb"; //<put here the user token that you run in the action init>;
//     var token = masterToken + ":" + userToken;
//
//     return backand.basicAuth(token)
//         .then(function() {
//             return backand.post('/1/objects/items' /* url for create */, {"name":"new item", "description":"new item description"} /* data to post */)
//         })
//         .then(function(result) {
//             console.log("create", result);
//             return backand.get('/1/objects/items' /* url to read a list */)
//         })
//         .then(function(result) {
//             console.log("read a list", result);
//             return backand.get('/1/objects/items/1' /* url to read a one */)
//         })
//         .then(function(result) {
//             console.log("read one", result);
//             return backand.put('/1/objects/items/1' /* url to update */, {"name":"new item change", "description":"new item description change"} /* data to post */)
//         });
// }
