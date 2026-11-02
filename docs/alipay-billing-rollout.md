# HN Tools 支付宝收款接入（待部署 / 安全上线清单）

本分支准备支付宝电脑网站支付、¥1 单次发布、¥99 永久权益。**暂未上线、未发起任何真实付款。**

## 业务规则

- 生成与预览继续免费；仅「生成正式链接」需要发布权益。
- 单次付款增加 1 次额度，成功发布一份链接扣除 1 次；永久会员对当前账号的两个隐私政策发布工具无限次数使用，不覆盖其他工具。
- 首页、工具表单和选择权益界面不主动显示价格；在确认付款时明确显示金额。
- 既有短链不动、持续公开可访问。退款不删除已有已发布链接。
- 金额只能由服务器的固定白名单计算，不信任浏览器。
- 支付宝异步回调需 RSA2 验签，并核对卖家、AppID、订单号、金额，不能依赖前端跳转结果。

## 项目

- 网站：https://privacy.hnchpower.cn/
- 支付宝网页应用 AppID：2021007114643065（2026-11-02 用户截图显示「已上线」）
- Supabase 项目：bypekqxsnuvqbgvdosdl
- 电脑网站支付接口：alipay.trade.page.pay
- 微信支付及手机网站支付是后续独立接入。

## 部署顺序（严格按顺序）

1. 备份 Supabase 数据库与函数配置。审查并执行 supabase/sql/002_alipay_billing.sql。它只新增账单和权益结构，不改历史短链。
2. 在 Supabase Edge Functions > Secrets 中配置以下环境变量。**不可把密钥发到聊天、截图或 GitHub**：
   - APP_SUPABASE_URL：现有项目 URL
   - APP_SUPABASE_SECRET_KEY：现有服务端 Secret / Service Role Key
   - ALIPAY_APP_ID：2021007114643065
   - ALIPAY_APP_PRIVATE_KEY：支付宝密钥工具导出的应用私钥，仅服务器保存
   - ALIPAY_PUBLIC_KEY：下载的支付宝公钥，用于验签
   - ALIPAY_SELLER_ID：支付宝商户用户 ID（通常 2088 开头，须商家后台核实）
   - ALIPAY_BILLING_ENABLED：false，**上线前必须保持关闭**
3. 部署新函数 create-alipay-order、alipay-notify、get-billing-status。
4. 重新部署原有 create-policy-link、create-document-policy-link。
5. 确认所有函数已部署且数据库一致，再测试本分支网站预览。禁止直接替换生产站点。
6. 完成模拟签名、数据库并发、伪造通知、测试环境回调等验证。
7. 确认支付宝支付产品已签约、应用已上线、异步通知 HTTPS 可公开访问、商户号和公钥匹配后，方可将 ALIPAY_BILLING_ENABLED 设置为 true。此开关会同时对两个发布入口强制服务端权益校验。
8. 由商户本人完成授权的小额人工付款，验证到账、权益、历史短链，再考虑全面上线。

## Edge Functions

- 下单：https://bypekqxsnuvqbgvdosdl.supabase.co/functions/v1/create-alipay-order
- 支付通知：https://bypekqxsnuvqbgvdosdl.supabase.co/functions/v1/alipay-notify
- 权益查询：https://bypekqxsnuvqbgvdosdl.supabase.co/functions/v1/get-billing-status

订单接口依赖登录；支付通知为支付宝服务器 POST，不能使用用户 JWT。页面跳转本身不授予权益。

## 安全测试矩阵

| 用例 | 预期 |
| --- | --- |
| 未登录创建订单 | 401，无订单 |
| 浏览器篡改价格 | 服务器仅认可 100 / 9900 分 |
| 伪造、验签失败的通知 | 拒绝，权益不发放 |
| AppID、卖家、金额不匹配的有效签名通知 | 拒绝，权益不发放 |
| 重复发同一成功通知 | 单订单只发权益一次 |
| 同账号并发抢最后一个发布额度 | 仅一条成功 |
| 断线重试相同 request_id | 返回同一条短链，不再扣费 |
| 新账号直接调用旧发布函数 | 收费开启后返回 402 |
| 历史协议链接 | 正常访问，不再次收费 |
| 退款 | 支付宝商家后台退款确认后由授权服务器调整权益 |
| 手机访问电脑网站支付 | 需单独适配手机网站支付，不视为已支持 |

## 发布边界

- 仍缺少生产密钥配置和真实付款验证，**不能声明已经收款成功**。
- 未经测试不可开启开关，否则可能影响用户发布。
- 对客户支付时必须显示实际金额、明确提供订单与售后规则。
- 退款 RPC 不会发起支付宝退款；必须验证商家后台真实退款后才可调整权益。
