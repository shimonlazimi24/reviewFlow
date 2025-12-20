# Installing ngrok for Local Testing

## Option 1: Install Homebrew + ngrok (Recommended)

### Step 1: Install Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts. This may take a few minutes.

### Step 2: After Homebrew installs, restart terminal or run:
```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Step 3: Install ngrok
```bash
brew install ngrok
```

## Option 2: Download ngrok Directly (Faster)

1. Go to: https://ngrok.com/download
2. Download for macOS
3. Unzip the file
4. Move to a location in your PATH:
   ```bash
   sudo mv ngrok /usr/local/bin/
   ```
5. Or run it directly from the download folder

## Option 3: Use ngrok Without Installation

You can download and run ngrok without installing:

```bash
# Download
curl -O https://bin.equinox.io/c/bNyj1mQV2kk/ngrok-v3-stable-darwin-amd64.zip

# Unzip
unzip ngrok-v3-stable-darwin-amd64.zip

# Make executable
chmod +x ngrok

# Run it (from the directory where you unzipped it)
./ngrok http 3000
```

## After Installing ngrok

1. Start your ReviewFlow server:
   ```bash
   cd /Users/shimon.lazimi/Desktop/reviewflow/reviewflow
   npm run dev
   ```

2. In a new terminal, start ngrok:
   ```bash
   ngrok http 3000
   ```

3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

4. Use this URL in Slack app settings for slash commands

