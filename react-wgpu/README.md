# WebGPU on React (sample for learning)

* TypeScript を使ってブラウザ上で WebGPU を動かすサンプルです。
* React を使っていますが、WebGPU は React とは何の関係もありません。単に動作確認の環境として React を使っただけで、それ以上の意味はありません。

## Chrome Canary
1. WebGPU は正式版の Chrome では動きません。 開発版である Chrome Canary をダウンロードしましょう。
2. さらに `chrome://flags/#enable-unsafe-webgpu` を開いて WebGPU を enable します。

## React project setting

このプロジェクトを作成した過程。

まず `create-react-app` で React プロジェクトを作成。TypeScript を使いたいので `--template TypeScript` を付けます。

```
$ npx create-react-app <name> --template typescript
```

WebGPU の機能を使うにあたって、TypeScript の型定義をインストールしておくと便利です。
まず npm で `@webgpu/types` を入れます。

```
$ npm install --save-dev @webgpu/types 
```
続いて、tsconfig.json に次のように `typeRoots` の設定を書き加えます。

```json
{
  "compilerOptions": {
    ...
    "typeRoots": [
      "./node_modules/@webgpu/types",
      "./node_modules/@types"
    ]
  },
  ...
}
```

以上で WebGPU の型定義が入ったはず。App.tsx などで `navigator.` と入力して、`navigator.gpu` がサジェストされるようになっていれば成功です。