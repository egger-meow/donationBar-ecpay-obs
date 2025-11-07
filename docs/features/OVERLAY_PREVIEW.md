# Overlay Preview Feature

## Overview
The admin panel now includes a **live preview** of the donation overlay at the bottom of the page. This allows you to see changes in real-time without needing to switch to the overlay page.

## Features

### 🎥 Live Preview
- **Real-time updates**: The preview shows live donation progress and alerts
- **Auto-refresh**: Automatically updates when you change overlay settings
- **Server-Sent Events**: Uses SSE to display donations as they come in

### 🎛️ Control Buttons

1. **🔄 重新整理預覽 (Refresh Preview)**
   - Manually refreshes the preview iframe
   - Useful if the preview appears stuck

2. **📏 切換預覽大小 (Toggle Size)**
   - Switches between 400px and 600px height
   - Allows better viewing of the full overlay

3. **🚀 在新分頁開啟 (Open in New Tab)**
   - Opens the full overlay page in a new browser tab
   - Useful for testing in fullscreen or sharing with others

## How It Works

### Location
The preview section is located at the bottom of the admin page, after the "管理操作" (Admin Actions) card.

### Automatic Updates
When you update any overlay settings:
1. Settings are saved to the database
2. SSE broadcasts the update to all connected clients
3. The preview automatically applies the new settings
4. A brief refresh occurs after 500ms to ensure changes are visible

### What You'll See
- ✅ Goal progress bar with current styling
- ✅ Recent donations list
- ✅ Donation alerts (if enabled)
- ✅ Goal completion celebrations
- ✅ All visual customizations (colors, fonts, sizes)

## Technical Details

### Implementation
- **Iframe**: Embeds `/overlay` page in the admin interface
- **Source**: `src="/overlay"` points to the same overlay used in OBS
- **Styling**: Black background with green "LIVE" indicator
- **Height**: Default 400px, expandable to 600px

### Real-time Updates
The preview uses the same real-time update system as the actual overlay:
- Connects to `/events` SSE endpoint
- Receives `message` events for donation updates
- Receives `overlay-settings` events for configuration changes
- Automatically reconnects if connection is lost

### Browser Compatibility
Works in all modern browsers that support:
- HTML5 iframes
- Server-Sent Events (SSE)
- CSS3 animations

## Usage Tips

1. **Adjust Settings**: Change colors, sizes, or positions in the "Overlay 外觀設定" section
2. **Watch Preview**: See changes applied automatically in the preview
3. **Test Donations**: Use the donate page to create test donations and watch them appear
4. **Expand View**: Click "切換預覽大小" if you need a larger view
5. **Full Screen**: Click "在新分頁開啟" to test in a separate window

## Troubleshooting

### Preview Not Loading
- Check that the server is running
- Verify `/overlay` endpoint is accessible
- Click "重新整理預覽" to force reload

### Changes Not Appearing
- Wait 1-2 seconds after saving settings
- Click "重新整理預覽" if auto-refresh fails
- Check browser console for errors

### Preview Stuck
- Refresh the entire admin page
- Check server logs for SSE connection issues
- Verify no firewall is blocking the connection

## Benefits

✅ **No Page Switching**: See overlay changes without leaving admin panel
✅ **Faster Testing**: Instantly verify setting changes
✅ **Better Workflow**: Adjust settings while watching the preview
✅ **Visual Feedback**: See exactly how the overlay looks in OBS
✅ **Real-time Testing**: Test with live donations and alerts

## Future Enhancements

Potential improvements for future versions:
- [ ] Adjustable preview scaling
- [ ] Side-by-side comparison mode
- [ ] Mobile-responsive preview
- [ ] Dark/light background toggle
- [ ] Screenshot/export functionality


預覽now take part one card size on the left but should take three card size (horizontal)
which means take the whole row are