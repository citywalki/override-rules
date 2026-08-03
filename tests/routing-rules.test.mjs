import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(new URL("../convert.js", import.meta.url), "utf8");

function convert(args = {}) {
    const context = { $arguments: { grouptype: "0", ...args } };
    vm.runInNewContext(script, context);
    return structuredClone(
        context.main({
            proxies: [
                { name: "香港 01", type: "ss", server: "hk.example.com", port: 443 },
                { name: "美国 01", type: "ss", server: "us.example.com", port: 443 },
            ],
        })
    );
}

function ruleIndex(rules, rule) {
    const index = rules.indexOf(rule);
    assert.notEqual(index, -1, `缺少规则：${rule}`);
    return index;
}

test("builds the streamlined routing groups and providers", () => {
    const result = convert();
    const groupNames = result["proxy-groups"].map(({ name }) => name);

    for (const removed of ["SSH", "哔哩哔哩", "巴哈姆特", "E-Hentai", "TikTok", "新浪微博"]) {
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

test("orders domestic, service, static, GFW, IP and final routing layers", () => {
    const { rules } = convert();

    const privateDomain = ruleIndex(rules, "GEOSITE,private,DIRECT");
    const privateIp = ruleIndex(rules, "GEOIP,private,DIRECT,no-resolve");
    const quicReject = ruleIndex(rules, "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    const steamDirect = ruleIndex(rules, "DOMAIN,steamcdn-a.akamaihd.net,DIRECT");
    const domestic = ruleIndex(rules, "GEOSITE,cn,DIRECT");
    const ai = ruleIndex(rules, "GEOSITE,category-ai-!cn,AI服务");
    const youtube = ruleIndex(rules, "GEOSITE,youtube,Youtube");
    const staticResources = ruleIndex(rules, "RULE-SET,StaticResources,静态资源");
    const gfw = ruleIndex(rules, "RULE-SET,GFWList,选择代理");
    const domesticIp = ruleIndex(rules, "GEOIP,cn,DIRECT");
    const final = ruleIndex(rules, "MATCH,Final");

    assert.ok(privateDomain < privateIp);
    assert.ok(privateIp < quicReject);
    assert.ok(quicReject < steamDirect);
    assert.ok(steamDirect < domestic);
    assert.ok(domestic < ai);
    assert.ok(ai < youtube);
    assert.ok(youtube < staticResources);
    assert.ok(staticResources < gfw);
    assert.ok(gfw < domesticIp);
    assert.equal(final, rules.length - 1);

    assert.equal(
        rules.some((rule) => rule.startsWith("DST-PORT,22,")),
        false
    );
    assert.equal(rules.includes("GEOSITE,weibo,新浪微博"), false);
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
