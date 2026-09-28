/* Android 键盘底部导航栏（平台专属组件）：Android 没有这一条，不渲染任何内容。
   显式注册空实现而不是「不注册」，好处是组件清单里能直接读出「Android 无底栏」这条平台事实，
   避免以后误判成漏画。 */
LoveCoUI.define('android', 'kb-navbar', () => '');
