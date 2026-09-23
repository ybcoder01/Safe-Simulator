import Image from "next/image";

interface Props {
  readonly label: string;
  readonly logoKey: string | null;
  readonly size?: number;
}

const protocolLogoPaths: Readonly<Record<string, string>> = {
  curve: "/protocol-logos/curve.png",
  fathom: "/protocol-logos/fathom.svg",
  morpho: "/protocol-logos/morpho.svg",
  oku: "/protocol-logos/oku.svg",
  reservoir: "/protocol-logos/reservoir.png",
  silo: "/protocol-logos/silo.svg",
  stargate: "/protocol-logos/stargate.svg",
  xswap: "/protocol-logos/xswap.png",
  yieldnest: "/protocol-logos/yieldnest.svg",
};

export function ProtocolMark({ label, logoKey, size = 34 }: Props) {
  const imagePath = logoKey ? protocolLogoPaths[logoKey] : undefined;

  return (
    <span
      aria-label={`${label} logo`}
      className={`protocol-logo protocol-logo-${logoKey ?? "fallback"}`}
      role="img"
      style={{ height: size, width: size }}
    >
      {imagePath ? (
        <Image
          alt=""
          height={size}
          src={imagePath}
          style={{ height: "100%", objectFit: "contain", width: "100%" }}
          unoptimized
          width={size}
        />
      ) : (
        label.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
