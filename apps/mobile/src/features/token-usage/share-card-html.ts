/** Web canvas share card. The PNG is produced in a WebView, not by photographing the phone. */
export function shareCardHtml(args: {
  cost: string;
  days: string;
  isDark: boolean;
  messages: string;
  shareText: string;
  tokens: string;
}) {
  const bg = args.isDark ? "#0c0c0c" : "#efefef";
  const footer = args.isDark ? "#141414" : "#f4f4f5";
  const fg = args.isDark ? "#ffffff" : "#0a0a0a";
  const muted = args.isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.48)";
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${bg}">
<canvas id="c" style="width:100%;height:auto;display:block"></canvas>
<script>
const W = 960, pageH = 420, footerH = 92;
const canvas = document.getElementById("c");
const dpr = 2;
canvas.width = W * dpr;
canvas.height = (pageH + footerH) * dpr;
const ctx = canvas.getContext("2d");
ctx.scale(dpr, dpr);
ctx.fillStyle = ${JSON.stringify(bg)};
ctx.fillRect(0, 0, W, pageH);
ctx.fillStyle = ${JSON.stringify(fg)};
ctx.font = "600 22px -apple-system, sans-serif";
ctx.fillText("Token usage", 40, 56);
ctx.font = "700 72px -apple-system, sans-serif";
ctx.fillText(${JSON.stringify(args.tokens)}, 40, 150);
ctx.font = "600 28px -apple-system, sans-serif";
ctx.fillStyle = ${JSON.stringify(muted)};
ctx.fillText(${JSON.stringify(args.cost)}, 40, 196);
ctx.font = "500 18px -apple-system, sans-serif";
ctx.fillText(${JSON.stringify(args.messages + " messages")}, 40, 260);
ctx.fillText(${JSON.stringify(args.days + " active days")}, 40, 290);
ctx.fillStyle = ${JSON.stringify(footer)};
ctx.beginPath();
ctx.moveTo(0, pageH - 16);
ctx.quadraticCurveTo(0, pageH, 16, pageH);
ctx.lineTo(W - 16, pageH);
ctx.quadraticCurveTo(W, pageH, W, pageH - 16);
ctx.lineTo(W, pageH + footerH);
ctx.lineTo(0, pageH + footerH);
ctx.closePath();
ctx.fill();
ctx.fillStyle = ${JSON.stringify(muted)};
ctx.font = "600 13px -apple-system, sans-serif";
ctx.fillText("atmos.land", 36, pageH + 34);
ctx.fillStyle = ${JSON.stringify(fg)};
ctx.font = "600 18px -apple-system, sans-serif";
ctx.fillText("Atmosphere for Agentic Builders", 36, pageH + 62);
function post(payload){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload)); }
post({ type: "preview", url: canvas.toDataURL("image/png") });
window.shareCard = function(){
  canvas.toBlob(async (blob) => {
    const file = new File([blob], "atmos-token-usage.png", { type: "image/png" });
    const text = ${JSON.stringify(args.shareText)};
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        post({ type: "shared" });
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    post({ type: "preview", url: canvas.toDataURL("image/png") });
    post({ type: "share-fallback" });
  });
};
</script></body></html>`;
}
