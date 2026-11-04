# 可滑动游戏母体演示

一个格斗母体的三个主题版本：猫狗擂台、漫画恶搞对战、第三东京市同人测试。

上下滑动切换，自动无声预览，点击试玩进入真实游戏，退出后继续刷。
定制入口目前支持改名字、参考图片本地预览与文字草稿，不调用AI生成、不收费、不上传用户图片。

## 在线体验

https://raingingkleec.github.io/game-feed-demo/

## 部署

为了使用浏览器上传并保留目录结构，运行资源以五个独立 ZIP 分包存放，每个包小于25MB。分包中是完整的 HTML/CSS/JavaScript 与美术资源，并不是安装包。

GitHub Actions 将 `site-part-*.zip` 解压合并为静态站点，再发布到 GitHub Pages。仓库 Settings → Pages → Source 选择 GitHub Actions。

本地可将全部分包解压到同一空目录，再执行 `python3 -m http.server 4181`，打开 `http://localhost:4181/`。

该仓库仅用于原型展示；不是已上线的付费定制平台。示例形象不代表真实事件、人物背书或第三方官方授权。
