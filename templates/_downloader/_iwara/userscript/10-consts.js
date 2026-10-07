    "use strict";

    const VER = "{{VER}}";
    const ACCOUNT_TTL_MS = {{ACCOUNT_TTL_MS}}; // 换页不重复打 /api/account-check
    const SRV_SESSION_KEY = "{{SRV_KEY}}_session";
    const IWARA_ICON = "{{ICON}}";
    const LOGIN_WARN_DAYS = {{LOGIN_WARN_DAYS}};
    const SRV_KEY = "{{SRV_KEY}}";
    const SRV_PWD_KEY = "{{SRV_PWD_KEY}}";
    // 填写与读取分离：已添加的凭证在服务端只读展示，不支持修改，只能删除
    const SRV_LIST_KEY = "{{SRV_LIST_KEY}}";
    const COOKIE_CACHE_KEY = "{{COOKIE_CACHE_KEY}}";
    const USER_CACHE_KEY = "{{USER_CACHE_KEY}}";
    const SKEW_MS = {{SKEW_MS}}; // 提前 1 分钟视为过期
