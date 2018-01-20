// httpモジュールを読み込み、インスタンスを生成
var http = require('http');
var fs = require('fs');
var zlib = require('zlib');
var ejs = require('ejs');
var stream = require('stream');
var requestPromise = require('request-promise');

function getType(_url) {
    var types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".png": "image/png",
        ".gif": "image/gif",
        ".svg": "svg+xml"
    };
    for (var key in types) {
        if (_url.endsWith(key)) {
            return types[key];
        }
    }
    return "text/plain";
}

/* render template */
function render(req, res, template, json) {
    var contentTemplate = fs.readFileSync('app/views/' + template, 'utf-8');
    var contentHtml = ejs.render(contentTemplate, json);

    var headTemplate = fs.readFileSync('app/views/layouts/head.ejs', 'utf-8');
    var headHtml = ejs.render(headTemplate, {title: "タイトル"});

    var layoutTemplate = fs.readFileSync('app/views/layouts/layout.ejs', 'utf-8');
    var resultHtml = ejs.render(layoutTemplate, {content: contentHtml, head: headHtml});

    var resultStream = new stream.Readable;
    resultStream._read = function noop() {
    };
    resultStream.push(resultHtml);
    resultStream.push(null);

    res.setHeader('content-type', 'text/html; charset=utf-8');

    var acceptEncoding = req.headers['accept-encoding'] || "";
    if (acceptEncoding.match(/\bdeflate\b/)) {
        res.setHeader('content-encoding', 'deflate');
        resultStream.pipe(zlib.createDeflate()).pipe(res);
    } else if (acceptEncoding.match(/\bgzip\b/)) {
        res.setHeader('content-encoding', 'gzip');
        resultStream.pipe(zlib.createGzip()).pipe(res);
    } else {
        resultStream.pipe(res);
    }
}

function generateApiRequestWithParam(paramDictionary, apiResource) {
    for (key in paramDictionary) {
        var param = paramDictionary[key];
        apiResource = apiResource.replace("{" + key + "}", param);
    }
    return apiResource;
}

// HTTPサーバーのイベントハンドラを定義
http.createServer(function (req, res) {
    var reqUrl = decodeURI(req.url);

    /* public以下のリソースに存在しているものの場合は、そのまま返す */
    var filename = "public" + reqUrl;
    if (fs.existsSync(filename) && !fs.statSync(filename).isDirectory()) {
        var data = fs.readFileSync(filename);
        res.setHeader('content-type', getType(reqUrl));
        res.end(data);
        return;
    }

    var routing = {
        "#": "App.Index",
        "accounts": {
            "#": "Accounts.Index",
            "login": "Accounts.Login",
            "search": "Accounts.Search",
            ":id": "Accounts.Detail"
        }
    };

    var paramDictionary = {};

    /* ルーティング */
    var routeString = "";
    var routes = reqUrl.split("/");
    for (var i = 1; i < routes.length; i++) {
        var key = routes[i];
        if (key === "") {
            key = "#"
        }
        switch (typeof(routing[key])) {
            case "object":
                routing = routing[key];
                break;
            case "string":
                routeString = routing[key];
                routing = {};
                break;
            case "undefined":

                // 「:」からはじまるkeyが存在するか判定する
                var routingKeys = Object.keys(routing);
                var keyStartWithColon = "";
                for (var j = 0; j < routingKeys.length; j++) {
                    var checkedKey = routingKeys[j];
                    if (checkedKey.lastIndexOf(":", 0) === 0) { //「:」からはじまる場合
                        keyStartWithColon = checkedKey;
                        break;
                    }
                }

                //「:」からはじまるkeyがない場合break
                if (keyStartWithColon === "") {
                    routeString = "";
                    routing = {};
                    break;
                }

                //「:」以降をkeyとしてdictに追加する
                paramDictionary[keyStartWithColon.substr(1)] = key;

                switch (typeof(routing[keyStartWithColon])) {
                    case "object":
                        routing = routing[keyStartWithColon];
                        break;
                    case "string":
                        routeString = routing[keyStartWithColon];
                        routing = {};
                        break;
                }
                break;
        }
    }
    if (routeString === "") {
        routeString = "System.404";
    }

    var resources = {
        "App": {
            "Index": {
                "template": "app/index.ejs"
            }
        },
        "Accounts": {
            "Index": {
                "api": "https://qiita.com/so-ta/items/7f1b29b7d2098b5fd188.json",
                "template": "accounts/index.ejs"
            },
            "Login": {
                "api": "accounts/login",
                "template": "accounts/login.ejs"
            },
            "Detail": {
                "api": "https://qiita.com/so-ta/items/{id}.json",
                "template": "accounts/index.ejs"
            }
        },
        "System": {
            "404": {
                "statusCode": 404,
                "template": "errors/404.ejs"
            }
        }
    };
    /* 使用するアクションの探索 */
    var route = routeString.split(".");
    for (i = 0; i < route.length; i++) {
        resources = resources[route[i]];
    }

    var statusCode = 200;
    if (typeof(resources["statusCode"]) === "number") {
        statusCode = resources["statusCode"];
    }
    res.statusCode = statusCode;

    var template = resources["template"];

    if (typeof(resources["api"]) === "undefined") {
        render(req, res, template, {});
        return
    }

    var apiRequest = {
        uri: generateApiRequestWithParam(paramDictionary, resources["api"]),
        transform2xxOnly: true,
        transform: function (body) {
            return JSON.parse(body);
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'
        }
    };

    requestPromise(apiRequest)
        .then(function (json) {
            render(req, res, template, json);

        })
        .catch(function (err) {
            console.log(err);
            res.writeHead(500, {
                "Content-Type": "text/plain"
            });
            res.write("[" + err.statusCode + "] API Request Error");
            res.end();
        });

}).listen(1337, '127.0.0.1'); // 127.0.0.1の1337番ポートで待機
