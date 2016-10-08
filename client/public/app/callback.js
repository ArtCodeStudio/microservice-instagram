angular.module('LoginCallback', ['angular-storage', 'ui.router', 'backand'])

.config(function(BackandProvider, $stateProvider, $urlRouterProvider, $httpProvider) {
    BackandProvider.setAnonymousToken('c194f6c0-0912-4205-b026-ac1e18f58356');
    BackandProvider.setAppName('taggedimages');
    //BackandProvider.setSignUpToken('Your SignUp Token');
    $stateProvider
        .state('login-callback', {
            url: '/',
            templateUrl: 'app/templates/login-callback.tmpl.html',
            controller: 'LoginCallbackCtrl',
            controllerAs: 'callback'
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

.controller('LoginCallbackCtrl', function($rootScope, $window){
    // http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript#comment20589800_901144
    var getParameterByName = function(name, url) {
        if (!url) url = $window.location.href;
        name = name.replace(/[\[\]]/g, "\\$&");
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }

    console.log("code", getParameterByName('code'));
    console.log("hmac", getParameterByName('hmac'));
    console.log("shop", getParameterByName('shop'));
    console.log("state", getParameterByName('state'));
    console.log("timestamp", getParameterByName('timestamp'));
    
})


.controller('MainCtrl', function ($rootScope, $state, Backand) {
    var main = this;

    function logout() {
        Backand.signout()
            .then(function(){
                $state.go('login');
            })
    }

    $rootScope.$on('unauthorized', function() {
        $state.go('login');
    });

    main.logout = logout;
});