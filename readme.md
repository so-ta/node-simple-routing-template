# node simple routing template
ルーティングから必要に応じてAPIを叩いて、  
Viewレンダリングまでするテンプレートエンジン＋α  
  
## ルーティング
### コントローラのルーティング例
```json
{
	"#": "App.Index",
	"accounts": {
		"#" : "Accounts.Index",
		"login" : "Accounts.Login",
		"search" : "Accounts.Search"
	}
}
```

### コントローラアクションを定義例
- ステータスコード
- コールするAPIエンドポイント
- 使用するテンプレート
```json
{
	"App": {
		"Index": {
			"template": "app/index.ejs"
		}
	},
	"Accounts" : {
		"Index": {
			"template": "accounts/index.ejs"
		},
		"Login": {
			"api": "accounts/login",
			"template": "accounts/login.ejs"
		},
		"Search": {
			"api": "accounts/search",
			"template": "accounts/search.ejs"
		}
	},
	"System": {
		"404": {
			"statusCode": 404,
			"template": "errors/404.ejs"
		}
	}
}
```