import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(new URL("../convert.js", import.meta.url), "utf8");

function convert(
    args = {},
    proxies = [
        { name: "香港 01", type: "ss", server: "hk.example.com", port: 443 },
        { name: "美国 01", type: "ss", server: "us.example.com", port: 443 },
    ]
) {
    const context = { $arguments: { grouptype: "0", ...args } };
    vm.runInNewContext(script, context);
    return structuredClone(context.main({ proxies }));
}

function ruleIndex(rules, rule) {
    const index = rules.indexOf(rule);
    assert.notEqual(index, -1, `缺少规则：${rule}`);
    return index;
}

test("builds the streamlined routing groups and providers", () => {
    const result = convert();
    const groupNames = result["proxy-groups"].map(({ name }) => name);

    for (const removed of [
        "SSH",
        "哔哩哔哩",
        "巴哈姆特",
        "E-Hentai",
        "TikTok",
        "新浪微博",
        "PikPak网盘",
    ]) {
        assert.equal(groupNames.includes(removed), false, `不应生成策略组：${removed}`);
    }

    for (const provider of [
        "TikTok",
        "EHentai",
        "Crypto",
        "Weibo",
        "SteamFix",
        "GoogleFCM",
        "AdditionalFilter",
    ]) {
        assert.equal(
            provider in result["rule-providers"],
            false,
            `不应生成规则提供者：${provider}`
        );
    }
});

test("ships only the geo databases the rules actually use", () => {
    const result = convert();
    assert.deepEqual(Object.keys(result["geox-url"]).sort(), ["geoip", "geosite"]);
});

test("uses the binary mrs format for the adblock provider", () => {
    const adblock = convert()["rule-providers"].ADBlock;
    assert.equal(adblock.format, "mrs");
    assert.match(adblock.url, /\.mrs$/);
    assert.match(adblock.path, /\.mrs$/);
});

test("enables geo auto-update for full configs only", () => {
    const full = convert({ full: "true" });
    assert.equal(full["geo-auto-update"], true);
    assert.equal(full["geo-update-interval"], 24);

    const minimal = convert();
    assert.equal(minimal["geo-auto-update"], undefined);
    assert.equal(minimal["geo-update-interval"], undefined);
});

test("orders domestic, service, static, GFW, IP and final routing layers", () => {
    const { rules } = convert();

    const privateDomain = ruleIndex(rules, "GEOSITE,private,DIRECT");
    const privateIp = ruleIndex(rules, "GEOIP,private,DIRECT,no-resolve");
    const quicReject = ruleIndex(rules, "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    const steamDirect = ruleIndex(rules, "DOMAIN,steamcdn-a.akamaihd.net,DIRECT");
    const synologyDirect = ruleIndex(rules, "DOMAIN-SUFFIX,synology.com,DIRECT");
    const synologyMe = ruleIndex(rules, "DOMAIN-SUFFIX,synology.me,DIRECT");
    const quickConnect = ruleIndex(rules, "DOMAIN-SUFFIX,quickconnect.to,DIRECT");
    const domestic = ruleIndex(rules, "GEOSITE,cn,DIRECT");
    const ai = ruleIndex(rules, "GEOSITE,category-ai-!cn,AI服务");
    const youtube = ruleIndex(rules, "GEOSITE,youtube,Youtube");
    const staticResources = ruleIndex(rules, "RULE-SET,StaticResources,静态资源");
    const gfw = ruleIndex(rules, "RULE-SET,GFWList,选择代理");
    const chinaDirect = ruleIndex(rules, "RULE-SET,ChinaDirect,DIRECT");
    const domesticIp = ruleIndex(rules, "GEOIP,cn,DIRECT");
    const chinaIp = ruleIndex(rules, "RULE-SET,ChinaIP,DIRECT,no-resolve");
    const final = ruleIndex(rules, "MATCH,Final");

    assert.ok(privateDomain < privateIp);
    assert.ok(privateIp < quicReject);
    assert.ok(quicReject < steamDirect);
    assert.ok(steamDirect < synologyDirect);
    // 群晖 DDNS 与 QuickConnect 域名解析到家庭公网 IP，必须在国内兜底之前直连，避免落入 MATCH 走代理
    assert.ok(synologyDirect < synologyMe);
    assert.ok(synologyMe < quickConnect);
    assert.ok(quickConnect < domestic);
    assert.ok(domestic < ai);
    assert.ok(ai < youtube);
    assert.ok(youtube < staticResources);
    assert.ok(staticResources < gfw);
    // 被墙域名即使解析出国内 IP 也必须优先走代理，因此 GFWList 位于国内直连兜底之前
    assert.ok(gfw < chinaDirect);
    assert.ok(chinaDirect < domesticIp);
    assert.ok(domesticIp < chinaIp);
    assert.ok(chinaIp < final);
    assert.equal(final, rules.length - 1);

    assert.equal(
        rules.some((rule) => rule.startsWith("DST-PORT,22,")),
        false
    );
    assert.equal(rules.includes("GEOSITE,weibo,新浪微博"), false);
});

test("ships independent China fallback rule sets from Loyalsoldier", () => {
    const { "rule-providers": providers } = convert();

    assert.deepEqual(
        {
            type: providers.ChinaDirect.type,
            behavior: providers.ChinaDirect.behavior,
            format: providers.ChinaDirect.format,
            interval: providers.ChinaDirect.interval,
            url: providers.ChinaDirect.url,
        },
        {
            type: "http",
            behavior: "domain",
            format: "yaml",
            interval: 86400,
            url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt",
        }
    );
    assert.deepEqual(
        {
            type: providers.ChinaIP.type,
            behavior: providers.ChinaIP.behavior,
            format: providers.ChinaIP.format,
            interval: providers.ChinaIP.interval,
            url: providers.ChinaIP.url,
        },
        {
            type: "http",
            behavior: "ipcidr",
            format: "yaml",
            interval: 86400,
            url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt",
        }
    );
});

test("splits DNS resolution between domestic nameservers and overseas DoH", () => {
    for (const result of [convert({ fakeip: "true" }), convert({ fakeip: "false" })]) {
        const policy = result.dns["nameserver-policy"];
        assert.ok(policy, "缺少 nameserver-policy");
        assert.ok(Array.isArray(policy["geosite:cn"]) && policy["geosite:cn"].length > 0);
        assert.ok(
            Array.isArray(policy["geosite:geolocation-!cn"]) &&
                policy["geosite:geolocation-!cn"].length > 0
        );
    }
});

test("keeps doggy DNS policy ahead of the domestic split", () => {
    const result = convert({ doggyDns: "true" }, [
        { name: "狗狗机场", type: "ss", server: "vip.quandao.com", port: 443, password: "token" },
    ]);
    const keys = Object.keys(result.dns["nameserver-policy"]);

    // 具体域名键优先于 geosite 集合键，因此 doggy 键必须排在最前
    assert.deepEqual(keys.slice(0, 2), ["+.quandao.com", "+.jiandaoyun.com"]);
    assert.ok(keys.includes("geosite:cn"));
    assert.ok(keys.includes("geosite:geolocation-!cn"));
});

test("uses maintained GeoSite rules and inline compatibility overrides", () => {
    const { rules } = convert();

    for (const expected of [
        "GEOSITE,category-cryptocurrency,加密货币",
        "GEOSITE,googlefcm,DIRECT",
        "DOMAIN,android.apis.google.com,DIRECT",
        "DOMAIN,device-provisioning.googleapis.com,DIRECT",
        "DOMAIN,firebaseinstallations.googleapis.com,DIRECT",
        "GEOSITE,google-play@cn,DIRECT",
        "GEOSITE,microsoft@cn,DIRECT",
        "GEOSITE,apple-cn,DIRECT",
    ]) {
        ruleIndex(rules, expected);
    }
});

test("keeps DNS HTTP/3 preference aligned with QUIC routing", () => {
    const disabled = convert({ quic: "false" });
    assert.equal(disabled.dns["prefer-h3"], false);
    assert.equal(disabled.rules.includes("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT"), true);

    const enabled = convert({ quic: "true" });
    assert.equal(enabled.dns["prefer-h3"], true);
    assert.equal(enabled.rules.includes("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT"), false);
});
