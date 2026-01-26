{ pkgs, ... }: {
  channel = "stable-24.05";

  packages = [
    pkgs.nodejs_20
  ];

  idx = {
    extensions = [
      "dbaeumer.vscode-eslint"
      "vscodevim.vim"
    ];

    workspace = {
      onCreate = {
        root-npm-install = "npm install";
        functions-npm-install = "npm --prefix functions install";
      };
      onStart = {};
    };
  };
}
