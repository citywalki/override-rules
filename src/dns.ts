import type { DnsConfig, ProxyNode, SnifferConfig } from "./types";

/**
 * 默认的 fake-ip 过滤域名列表。
 * 这些域名不会被 fake-ip 机制代理。
 */
const FAKE_IP_FILTER = [
    "geosite:private",
    "geosite:connectivity-check",
    "dig.io.mi.com",
    "localhost.ptlogin2.qq.com",
    "*.icloud.com",
    "*.stun.*.*",
    "*.stun.*.*.*",
];

/**
 * 嗅探器配置。
 */
export const snifferConfig: SnifferConfig = {
    sniff: {
        TLS: {
            ports: [443, 8443],
        },
        HTTP: {
            ports: [80, 8080, 8880],
        },
        QUIC: {
            ports: [443, 8443],
        },
    },
    "override-destination": false,
    enable: true,
    "force-dns-mapping": true,
    "skip-domain": ["dlg.io.mi.com", "+.push.apple.com"],
};

/**
 * 构建 DNS 配置的输入参数类型。
 */
interface BuildDnsConfigInput {
    mode: "redir-host" | "fake-ip";
    ipv6Enabled: boolean;
    preferH3: boolean;
    fakeIpFilter?: string[];
}

/**
 * 国内权威 DNS：保证国内域名解析出中国大陆 IP，使 `GEOIP,cn` 判定成立。
 */
const CN_NAMESERVERS = ["223.5.5.5", "119.29.29.29", "180.184.1.1"];

/**
 * 海外加密 DNS：解析结果可信，兼作 `fallback` 与境外域名的 policy 解析服务器。
 */
const OVERSEAS_NAMESERVERS = [
    "quic://dns0.eu",
    "https://dns.cloudflare.com/dns-query",
    "https://dns.sb/dns-query",
    "tcp://208.67.222.222",
    "tcp://8.26.56.2",
];

/**
 * 构建 Clash DNS 配置对象。
 * @param {BuildDnsConfigInput} params - 构建参数
 * @param {('redir-host'|'fake-ip')} params.mode - DNS 增强模式
 * @param {boolean} params.ipv6Enabled - 是否启用 IPv6
 * @param {string[]=} params.fakeIpFilter - fake-ip 过滤域名列表（可选）
 * @returns {DnsConfig} DNS 配置对象
 */
function buildDnsConfig({
    mode,
    ipv6Enabled,
    preferH3,
    fakeIpFilter,
}: BuildDnsConfigInput): DnsConfig {
    const config: DnsConfig = {
        enable: true,
        ipv6: ipv6Enabled,
        "prefer-h3": preferH3,
        "enhanced-mode": mode,
        "default-nameserver": ["119.29.29.29", "223.5.5.5"],
        nameserver: ["system", ...CN_NAMESERVERS],
        fallback: OVERSEAS_NAMESERVERS,
        // 国内域名由国内权威 DNS 解析（policy 命中返回真实 IP，GEOIP,cn 可直接判定）；
        // 境外域名直连海外加密 DNS，避免国内 DNS 污染。具体域名键优先于 geosite 集合键。
        "nameserver-policy": {
            "geosite:cn": CN_NAMESERVERS,
            "geosite:geolocation-!cn": OVERSEAS_NAMESERVERS,
        },
    };

    if (fakeIpFilter) {
        config["fake-ip-filter"] = fakeIpFilter;
    }

    return config;
}

const DOGGYGO_SERVER_DOMAINS = ["quandao.com", "jiandaoyun.com"] as const;

function buildDoggyGoNameserverPolicy(
    proxies: ProxyNode[]
): DnsConfig["nameserver-policy"] | undefined {
    for (const proxy of proxies) {
        const server = proxy.server?.toLowerCase();
        const password = proxy.password;
        if (
            !server ||
            typeof password !== "string" ||
            password.length === 0 ||
            !DOGGYGO_SERVER_DOMAINS.some(
                (domain) => server === domain || server.endsWith(`.${domain}`)
            )
        ) {
            continue;
        }

        const resolvers = [
            `https://doh.dohcore.com:2096/dns-query/${password}#skip-cert-verify=true`,
            `https://doh.cloudflare-lab.com:2096/dns-query/${password}#skip-cert-verify=true`,
        ];
        return {
            "+.quandao.com": resolvers,
            "+.jiandaoyun.com": resolvers,
        };
    }

    return undefined;
}

/**
 * 构建 DNS 配置的输入参数类型（外部接口）。
 */
export interface BuildDnsInput {
    fakeIPEnabled: boolean;
    ipv6Enabled: boolean;
    quicEnabled: boolean;
    source?: DnsConfig;
    proxies: ProxyNode[];
    doggyDnsEnabled: boolean;
}

/**
 * 根据 fakeIP 和 IPv6 开关生成最终 DNS 配置。
 * 上游订阅已声明的 DNS 字段优先，未声明的字段使用脚本默认值。
 * @param {BuildDnsInput} params - 构建参数
 * @param {boolean} params.fakeIPEnabled - 是否启用 fake-ip 模式
 * @param {boolean} params.ipv6Enabled - 是否启用 IPv6
 * @param {DnsConfig=} params.source - 上游订阅的 DNS 配置
 * @returns {DnsConfig} DNS 配置对象
 */
export function buildDns({
    fakeIPEnabled,
    ipv6Enabled,
    quicEnabled,
    source,
    proxies,
    doggyDnsEnabled,
}: BuildDnsInput): DnsConfig {
    const defaults = fakeIPEnabled
        ? buildDnsConfig({
              mode: "fake-ip",
              ipv6Enabled,
              preferH3: quicEnabled,
              fakeIpFilter: FAKE_IP_FILTER,
          })
        : buildDnsConfig({ mode: "redir-host", ipv6Enabled, preferH3: quicEnabled });
    const config = {
        ...defaults,
        ...source,
        ipv6: ipv6Enabled,
        "enhanced-mode": defaults["enhanced-mode"],
    };

    if (doggyDnsEnabled && source?.["nameserver-policy"] === undefined) {
        const doggyGoPolicy = buildDoggyGoNameserverPolicy(proxies);
        if (doggyGoPolicy) {
            // 具体域名键优先于 geosite 集合键，doggy 键必须排在默认分流之前
            config["nameserver-policy"] = {
                ...doggyGoPolicy,
                ...config["nameserver-policy"],
            };
        }
    }

    if (!fakeIPEnabled) {
        delete config["fake-ip-filter"];
    }

    return config;
}
