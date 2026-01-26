{ pkgs, ... }: {
  # Nix channel, determines available package versions
  channel = "stable-24.05";

  # Packages to install
  packages = [
    pkgs.nodejs_20  # For Node.js runtime
    pkgs.nodePackages.typescript # For TypeScript support
    pkgs.nodePackages.typescript-language-server
  ];

  # VS Code extensions to install
  idx = {
    extensions = [
      "dbaeumer.vscode-eslint",
      "vscodevim.vim"
    ];

    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        root-npm-install = "npm install";
        functions-npm-install = "npm --prefix functions install";
      };
      # Runs every time the workspace is (re)started
      onStart = {};
    };
  };
}
