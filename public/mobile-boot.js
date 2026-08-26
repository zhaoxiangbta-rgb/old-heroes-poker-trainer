(function () {
  function bootPanel() {
    return document.querySelector("[data-mobile-boot]");
  }
  function showFailure(detail) {
    var panel = bootPanel();
    if (!panel) return;
    panel.innerHTML = "<strong>牌局程序加载失败</strong><br><small>" + detail + "<br>请截图发给开发者</small>";
  }
  window.addEventListener("error", function (event) {
    var source = event.filename || (event.target && event.target.src) || "unknown";
    showFailure("错误：" + (event.message || "脚本未能下载") + " | " + source);
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    showFailure("错误：" + String(event.reason || "启动异常"));
  });
  document.addEventListener("DOMContentLoaded", function () {
    var panel = bootPanel();
    if (panel) panel.firstChild.textContent = "基础脚本正常，正在加载牌局…";
    window.setTimeout(function () {
      if (bootPanel()) showFailure("错误：MODULE_TIMEOUT | 主程序 8 秒内未启动");
    }, 8000);
  });
})();
