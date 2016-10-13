// backand sync --app taggedimages --master e7f01aa2-3c0e-4c7e-8ae7-c7b04654fc0a --user 828bee71-8a1e-11e6-8eff-0e00ae4d21e3 --folder client/public

angular.module('SimpleRESTWebsite', ['ui.router', 'backand', 'ngStorage'])

.config(function(BackandProvider, $stateProvider, $urlRouterProvider, $httpProvider) {
    console.log('config');
    BackandProvider.setAnonymousToken('c194f6c0-0912-4205-b026-ac1e18f58356');
    BackandProvider.setAppName('taggedimages');
    //BackandProvider.setSignUpToken('Your SignUp Token');
    $stateProvider
        .state('shop', {
            url: '/',
            templateUrl: 'app/templates/shop.tmpl.html',
            controller: 'ShopCtrl',
            controllerAs: 'shop'
        })
        .state('dashboard', {
            url: '/dashboard',
            templateUrl: 'app/templates/dashboard.tmpl.html',
            controller: 'DashboardCtrl',
            controllerAs: 'dashboard'
        });

    $urlRouterProvider.otherwise('/');

    $httpProvider.interceptors.push('APIInterceptor');
})

.service('APIInterceptor', function($rootScope, $q) {
    var service = this;

    console.log("APIInterceptor");
    service.responseError = function(response) {
        if (response.status === 401) {
            $rootScope.$broadcast('unauthorized');
        }
        return $q.reject(response);
    };
})

.service('Auth', function ($http, Backand) {

    var service = this;

    service.generateAuthUrl = function (storeName) {
        return $http ({
            method: 'POST',
            url: Backand.getApiUrl() + '/1/objects/action/auth/?name=generateAuthUrl',
            params: {
                parameters: {storeName: storeName}
            }
        });
    };

    service.getAccessToken = function (callbackParams) {
        return $http ({
            method: 'POST',
            url: Backand.getApiUrl() + '/1/objects/action/auth/?name=getAccessToken',
            params: {
                parameters: callbackParams
            }
        });
    }

})

.service('Shopify', function () {

    var service = this;

    service.redirect = function (store) {
        console.log('redirect', 'https://'+store);
        // this init function creates a redirect if this window is not in an iframe
        ShopifyApp.init({
            apiKey: '08267a137ead223d3dedfc4fe9f6c466',
            shopOrigin: 'https://'+store,
            forceRedirect: true,
            debug: true
        });
    };

})

.service('ItemsModel', function ($http, Backand) {
    var service = this,
        tableUrl = '/1/objects/',
        path = 'items/';

    function getUrl() {
        return Backand.getApiUrl() + tableUrl + path;
    }

    function getUrlForId(itemId) {
        return getUrl(path) + itemId;
    }

    service.all = function () {
        return $http.get(getUrl());
    };

    service.fetch = function (itemId) {
        return $http.get(getUrlForId(itemId));
    };

    service.create = function (item) {
        return $http.post(getUrl(), item);
    };

    service.update = function (itemId, item) {
        return $http.put(getUrlForId(itemId), item);
    };

    service.destroy = function (itemId) {
        return $http.delete(getUrlForId(itemId));
    };
})


.controller('ShopCtrl', function($rootScope, $scope, Shopify){
    var shop = this;

    console.log("ShopCtrl");

    shop.setShop = function() {
        Shopify.redirect(shop.storeName+'.myshopify.com');
    }
})

.controller('MainCtrl', function ($rootScope, $state, $window, $sessionStorage, Backand) {
    var main = this;

    console.log("MainCtrl", window.requestBy);

    $rootScope.$storage = $sessionStorage;

    if(window.URLParams && window.URLParams.shop) {
        $rootScope.$storage.shop = window.URLParams.shop;
    }

    // if this app request was directly the user needs to set his shopname
    if(window.requestBy === 'directly') {
        $state.go('shop');
    }

    // if this app request was from the auth_callback wie need to get the access token
    if(window.requestBy === 'auth_callback') {
        console.log("getAccessToken");
        Auth.getAccessToken(window.URLParams)
        .then(function(response) {
            var data = JSON.parse(response.data.Payload)
            $rootScope.$storage.token = data.token;
            $rootScope.$broadcast('token', data.token);
            console.log("getted token", $rootScope.$storage);
            $state.go('dashboard');
        }, function(error) {
            console.log(error);
        });
    }

    if(window.requestBy === 'shopify_iframe') {
        
        // ShopifyApp.Bar.initialize({
        //     icon: '/assets/header-icon.png',
        //     title: 'The App Title',
        //     buttons: {
        //         primary: {
        //             label: 'Save',
        //             message: 'save',
        //             callback: function(){
        //                 ShopifyApp.Bar.loadingOn();
        //                 doSomeCustomAction();
        //             }
        //         }
        //     }
        // });

        console.log("generateAuthUrl");
        Auth.generateAuthUrl(window.URLParams.shop)
        .then(function(response) {
            var data = JSON.parse(response.data.Payload);
            console.log(data);
            $window.location.href = data.authUrl;
        }, function(error) {
            console.log(error);
        });
    }

        $rootScope.$on('unauthorized', function() {
        //$state.go('shop');
        console.log('unauthorized');
    });

    if(window.ShopifyAppReady) {
        console.log("window.ShopifyAppReady");
        Auth.generateAuthUrl(window.URLParams.shop)
        .then(function(response) {
            var data = JSON.parse(response.data.Payload)
            console.log(data);
            $window.location.href = data.authUrl;
        }, function(error) {
            console.log(error);
        });
    } else {
        $state.go('shop');
    }
})

.controller('DashboardCtrl', function(ItemsModel){
    var dashboard = this;

    console.log("DashboardCtrl");

    function getItems() {
        ItemsModel.all()
            .then(function (result) {
                dashboard.items = result.data.data;
                console.log("dashboard.items", dashboard.items);
            });
    }

    function createItem(item) {
        ItemsModel.create(item)
            .then(function (result) {
                initCreateForm();
                getItems();
            });
    }

    function updateItem(item) {
        console.log("updateItem", item);
        ItemsModel.update(item.id, item)
            .then(function (result) {
                cancelEditing();
                getItems();
            });
    }

    function deleteItem(itemId) {
        ItemsModel.destroy(itemId)
            .then(function (result) {
                cancelEditing();
                getItems();
            });
    }

    function initCreateForm() {
        dashboard.newItem = { name: '', description: '' };
    }

    function setEditedItem(item) {
        dashboard.editedItem = angular.copy(item);
        dashboard.isEditing = true;
    }

    function isCurrentItem(itemId) {
        return dashboard.editedItem !== null && dashboard.editedItem.id === itemId;
    }

    function cancelEditing() {
        dashboard.editedItem = null;
        dashboard.isEditing = false;
    }

    dashboard.items = [];
    dashboard.editedItem = null;
    dashboard.isEditing = false;
    dashboard.getItems = getItems;
    dashboard.createItem = createItem;
    dashboard.updateItem = updateItem;
    dashboard.deleteItem = deleteItem;
    dashboard.setEditedItem = setEditedItem;
    dashboard.isCurrentItem = isCurrentItem;
    dashboard.cancelEditing = cancelEditing;

    initCreateForm();
    getItems();
});

var initAngular = function() {
    console.log("bootstrap Angular requestBy", window.requestBy);
    angular.element(function() {
        angular.bootstrap(window.document, ['SimpleRESTWebsite']);
    });
}

/**
 * Check url params outsite of angular
 * @see http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript#comment20589800_901144
 **/ 
var getParameterByName = function(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

window.URLParams = {
    code: getParameterByName('code'),
    hmac: getParameterByName('hmac'),
    protocol: getParameterByName('protocol'),
    shop: getParameterByName('shop'),
    state: getParameterByName('state'),
    timestamp: getParameterByName('timestamp'),
}

console.log(window.location.href, window.URLParams);

window.requestBy = 'directly';
if(window.URLParams.shop) {
    if(URLParams.code) {
        window.requestBy = 'auth_callback';
    } else {
        window.requestBy = 'shopify_iframe';
    }
}

if(window.requestBy === 'auth_callback' || window.requestBy === 'shopify_iframe') {
    ShopifyApp.init({
        apiKey: '08267a137ead223d3dedfc4fe9f6c466',
        shopOrigin: 'https://'+window.URLParams.shop,
        forceRedirect: true,
        debug: true
    });
    ShopifyApp.ready(function(){
        console.log("ShopifyApp.ready");
        window.ShopifyAppReady = true;
        initAngular();
    });
} else if (window.requestBy === 'directly') {
    initAngular();
}
