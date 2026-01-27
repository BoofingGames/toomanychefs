{ pkgs, ... }: {
  # Use a stable Nix channel for reproducibility.
  channel = "stable-24.05";

  # Install Node.js version 20.
  packages = [
    pkgs.nodejs_20
  ];

  # Configure the IDE itself.
  idx = {
    # Install VS Code extensions. Note: Nix lists are space-separated.
    extensions = [
      "dbaeumer.vscode-eslint"
      "vscodevim.vim"
    ];

    # Define commands to run at different workspace lifecycle events.
    workspace = {
      # Run these commands only once, when the workspace is first created.
      onCreate = {
        root-npm-install = "npm install";
        functions-npm-install = "npm --prefix functions install";
      };
      # This is kept empty to avoid conflicts with the preview service.
      onStart = {};
    };

    # Configure the web preview service.
    previews = {
      enable = true;
      previews = {
        web = {
          # The command to run the development server.
          command = ["npm" "run" "dev"];
          manager = "web";
          # Explicitly set the PORT environment variable for the command.
          # The `$PORT` on the right is a special variable provided by the preview service.
          # This is the correct way to pass the dynamic port to the application.
          env = { 
            PORT = "$PORT";
          };
        };
      };
    };
  };
}
