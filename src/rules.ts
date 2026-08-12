import { PROXY_GROUPS } from "./constants";

const baseRules = [
    `GEOSITE,private,DIRECT`,
    `GEOIP,private,DIRECT,no-resolve`,
    `RULE-SET,SogouInput,${PROXY_GROUPS.SOGOU_INPUT}`,
    `DOMAIN,tigr1234566.github.io,${PROXY_GROUPS.AD_BLOCK}`,
    `DOMAIN,rezvorck.github.io,${PROXY_GROUPS.AD_BLOCK}`,
    `RULE-SET,ADBlock,${PROXY_GROUPS.AD_BLOCK}`,
    `DOMAIN,steamcdn-a.akamaihd.net,DIRECT`,
    `DOMAIN-SUFFIX,cm.steampowered.com,DIRECT`,
    `DOMAIN-SUFFIX,steamserver.net,DIRECT`,
    `GEOSITE,googlefcm,DIRECT`,
    `DOMAIN,android.apis.google.com,DIRECT`,
    `DOMAIN,device-provisioning.googleapis.com,DIRECT`,
    `DOMAIN,firebaseinstallations.googleapis.com,DIRECT`,
    `GEOSITE,google-play@cn,DIRECT`,
    `GEOSITE,microsoft@cn,DIRECT`,
    `GEOSITE,apple-cn,DIRECT`,
    `GEOSITE,cn,DIRECT`,
    `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
    `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
    `GEOSITE,category-cryptocurrency,${PROXY_GROUPS.CRYPTO}`,
    `GEOSITE,youtube,${PROXY_GROUPS.YOUTUBE}`,
    `GEOSITE,netflix,${PROXY_GROUPS.NETFLIX}`,
    `GEOIP,netflix,${PROXY_GROUPS.NETFLIX},no-resolve`,
    `GEOSITE,twitch,${PROXY_GROUPS.TWITCH}`,
    `GEOSITE,spotify,${PROXY_GROUPS.SPOTIFY}`,
    `GEOSITE,telegram,${PROXY_GROUPS.TELEGRAM}`,
    `GEOIP,telegram,${PROXY_GROUPS.TELEGRAM},no-resolve`,
    `GEOSITE,twitter,${PROXY_GROUPS.TWITTER}`,
    `GEOSITE,xbox,${PROXY_GROUPS.XBOX}`,
    `GEOSITE,github,${PROXY_GROUPS.GITHUB}`,
    `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
    `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
    `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
    `RULE-SET,StaticResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
    `RULE-SET,CDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
    `RULE-SET,AdditionalCDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
    `RULE-SET,GFWList,${PROXY_GROUPS.SELECT}`,
    `GEOIP,cn,DIRECT`,
    `MATCH,${PROXY_GROUPS.FINAL}`,
];

/**
 * 构建最终的规则列表。
 *
 * @param {Object} params - 构建参数
 * @param {boolean} params.quicEnabled - 是否启用 QUIC（如未启用会插入 UDP:443 拦截规则）
 * @returns {string[]} 规则字符串数组
 */
export function buildRules({ quicEnabled }: { quicEnabled: boolean }): string[] {
    const ruleList = [...baseRules];
    if (!quicEnabled) {
        ruleList.splice(2, 0, "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    }
    return ruleList;
}
