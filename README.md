# Microservice to use Instagram in JumpLink Themes

We have developed this service to easily integrate a instagram account to our customers themes.

# Host yourself
If you wanna host this microservice for your own themes follow this instructions:

## Create a App
By default this microservice is designed for two types of theme integration apps:
 * For Shopify Themes
 * For OctoberCMS Plugin
 * For Client-Side integration using Instafeed

If you want to add your own you need to integrate your in three places of this microservice:


### config.json
By default or config.json looks like:

```json
{
    "instagramApps": {
        "shopify": {
            "name": "JumpLink Shopify Theme Integration",
            "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "tokenHost": "https://api.instagram.com",
            "tokenPath": "/oauth/access_token",
            "callbackPath": "/instagram-callback",
            "scopes": "basic public_content"
        },
        "october": {
            "name": "JumpLink OctoberCMS Theme Integration",
            "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "tokenHost": "https://api.instagram.com",
            "tokenPath": "/oauth/access_token",
            "callbackPath": "/instagram-callback",
            "scopes": "basic public_content"
        },
        "instafeed": {
            "name": "JumpLink Instafeed Integration",
            "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "tokenHost": "https://api.instagram.com",
            "tokenPath": "/oauth/access_token",
            "callbackPath": "/instagram-callback",
            "scopes": "basic public_content"
        }

    }
}
```

You need to add your integration app name like we have with 'shopify', 'october' and 'instafeed'.

### views/setup/[appName].pup

Here are the templates which are displayed before making a token request, each integration app from the config.json need to must a template file included here.
We are using the [pug](https://pugjs.org) template engine here.

### views/result/[appName].pup
The same rules apply as the setup template files. But these templates display the result token.