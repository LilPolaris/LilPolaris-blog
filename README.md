# Lil Polaris' Booook

Hexo + Butterfly source for `https://lilpolaris.github.io`.

## Local workflow

```powershell
npm ci
npm run server
npm run build
```

Manual deploy is still available:

```powershell
npm run deploy
```

## Automatic deploy

The workflow in `.github/workflows/deploy.yml` builds the site on every push to
`main`, then pushes the generated `public/` folder to
`LilPolaris/LilPolaris.github.io`.

The source repository needs one secret:

- `HEXO_DEPLOY_KEY`: an SSH private key whose public key has write access to the
  `LilPolaris.github.io` repository.
