#!/bin/bash
# Script to create a test PR for ReviewFlow

echo "🚀 Creating test PR for ReviewFlow..."

# Check if we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

# Create test branch
TEST_BRANCH="test-reviewflow-$(date +%s)"
echo "🌿 Creating branch: $TEST_BRANCH"
git checkout -b "$TEST_BRANCH"

# Create a test file
TEST_FILE="test-reviewflow.md"
echo "# Test PR for ReviewFlow" > "$TEST_FILE"
echo "" >> "$TEST_FILE"
echo "This is a test PR to verify ReviewFlow's automatic reviewer assignment." >> "$TEST_FILE"
echo "" >> "$TEST_FILE"
echo "Created: $(date)" >> "$TEST_FILE"

# Add and commit
git add "$TEST_FILE"
git commit -m "Test: ReviewFlow PR assignment

This PR tests the automatic reviewer assignment feature.
- Tests webhook delivery
- Tests reviewer selection
- Tests Slack notification"

# Push branch
echo "📤 Pushing branch to origin..."
git push origin "$TEST_BRANCH"

# Get remote URL
REMOTE_URL=$(git remote get-url origin)
if [[ "$REMOTE_URL" == *"github.com"* ]]; then
    # Extract owner/repo from URL
    if [[ "$REMOTE_URL" == *"git@github.com:"* ]]; then
        REPO=$(echo "$REMOTE_URL" | sed 's/.*git@github.com://' | sed 's/\.git$//')
    elif [[ "$REMOTE_URL" == *"https://github.com/"* ]]; then
        REPO=$(echo "$REMOTE_URL" | sed 's/.*https:\/\/github.com\///' | sed 's/\.git$//')
    fi
    
    echo ""
    echo "✅ Branch pushed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Go to: https://github.com/$REPO/compare/$TEST_BRANCH"
    echo "2. Click 'Create Pull Request'"
    echo "3. Add a title: 'Test: ReviewFlow PR Assignment'"
    echo "4. Click 'Create Pull Request'"
    echo ""
    echo "💡 ReviewFlow should automatically:"
    echo "   - Receive the webhook"
    echo "   - Assign reviewers"
    echo "   - Post to your Slack channel"
    echo ""
else
    echo ""
    echo "✅ Branch pushed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Go to your repository on GitHub"
    echo "2. Click 'New Pull Request'"
    echo "3. Select branch: $TEST_BRANCH"
    echo "4. Create the PR"
    echo ""
fi

