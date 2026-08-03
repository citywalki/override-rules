import { CDN_URL } from "./constants";
import type { RuleProvider } from "./types";

export const ruleProviders: Record<string, RuleProvider> = {
    ADBlock: {
        type: "http",
        behavior: "domain",
        format: "yaml",
        interval: 86400,
        url: `${CDN_URL}/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml`,
        path: "./ruleset/ADBlock.yaml",
    },
    SogouInput: {
        type: "http",
        behavior: "classical",
        format: "text",
        interval: 86400,
        url: "https://ruleset.skk.moe/Clash/non_ip/sogouinput.txt",
        path: "./ruleset/SogouInput.txt",
    },
    StaticResources: {
        type: "http",
        behavior: "domain",
        format: "text",
        interval: 86400,
        url: "https://ruleset.skk.moe/Clash/domainset/cdn.txt",
        path: "./ruleset/StaticResources.txt",
    },
    CDNResources: {
        type: "http",
        behavior: "classical",
        format: "text",
        interval: 86400,
        url: "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
        path: "./ruleset/CDNResources.txt",
    },
    AdditionalCDNResources: {
        type: "http",
        behavior: "classical",
        format: "text",
        interval: 86400,
        url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/AdditionalCDNResources.list`,
        path: "./ruleset/AdditionalCDNResources.list",
    },
    GFWList: {
        type: "http",
        behavior: "domain",
        format: "yaml",
        interval: 86400,
        url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt",
        path: "./ruleset/GFWList.yaml",
    },
};
