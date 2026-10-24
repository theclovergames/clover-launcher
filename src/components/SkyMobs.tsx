import type { CSSProperties } from "react";

import { HUSK_PALETTE, MOB_ART, MOB_GEOMETRY, SPIDER_LEGS, type MobKind } from "@/lib/mob-art";
import { cells } from "@/lib/pixels";
import { cn } from "@/lib/utils";

import "./sky-mobs.css";

export type { MobKind } from "@/lib/mob-art";

function Pixels({ rows, palette, x = 0, y = 0 }: { rows: readonly string[]; palette: Record<string, string>; x?: number; y?: number }) {
  return <g transform={`translate(${x} ${y})`}>{Object.entries(palette).map(([mark, color]) => {
    const path = cells(rows, mark);
    return path && <path key={mark} d={path} fill={color} />;
  })}</g>;
}

function Zombie({ husk }: { husk: boolean }) {
  const { parts } = MOB_ART.zombie;
  const palette = husk ? HUSK_PALETTE : MOB_ART.zombie.palette;
  return <>
    <g className="sky-mob-motion sky-mob-leg sky-mob-leg-back" style={{ transformOrigin: "10px 20px" }}>
      <Pixels rows={parts.leg} palette={palette} x={8} y={20} />
    </g>
    <g className="sky-mob-motion sky-mob-leg" style={{ transformOrigin: "11px 20px" }}>
      <Pixels rows={parts.leg} palette={palette} x={10} y={20} />
    </g>
    <g className="sky-mob-motion sky-mob-body">
      <g className="sky-mob-motion sky-zombie-arm sky-zombie-arm-back" style={{ transformOrigin: "11px 10px" }}>
        <Pixels rows={parts.arm} palette={palette} x={10} y={10} />
      </g>
      <Pixels rows={parts.torso} palette={palette} x={9} y={8} />
      <g className="sky-mob-motion sky-mob-head" style={{ transformOrigin: "11px 8px" }}>
        <Pixels rows={parts.head} palette={palette} x={7} />
      </g>
      <g className="sky-mob-motion sky-zombie-arm" style={{ transformOrigin: "11px 10px" }}>
        <Pixels rows={parts.arm} palette={palette} x={10} y={9} />
      </g>
    </g>
  </>;
}

function Creeper() {
  const { parts, palette } = MOB_ART.creeper;
  return <>
    {[6, 13, 4, 11].map((x, index) => <g key={index} className={cn("sky-mob-motion sky-mob-leg sky-creeper-leg", index % 2 === 0 && "sky-mob-leg-back")} style={{ transformOrigin: `${x + 2}px 20px`, opacity: index < 2 ? 0.65 : 1 }}>
      <Pixels rows={parts.leg} palette={palette} x={x} y={20} />
    </g>)}
    <g className="sky-mob-motion sky-mob-body">
      <Pixels rows={parts.torso} palette={palette} x={8} y={8} />
      <g className="sky-mob-motion sky-mob-head" style={{ transformOrigin: "10px 8px" }}>
        <Pixels rows={parts.head} palette={palette} x={6} />
      </g>
    </g>
  </>;
}

function Spider() {
  const { parts, palette } = MOB_ART.spider;
  const legs = (from: number, to: number) => SPIDER_LEGS.slice(from, to).map(([hipX, hipY, kneeX, kneeY, footX, footY], index) => <g key={index} className={cn("sky-mob-motion sky-spider-leg", index % 2 === 0 && "sky-mob-leg-back")} style={{ transformOrigin: `${hipX}px ${hipY}px` }}>
    <path d={`M${hipX} ${hipY}L${kneeX} ${kneeY}L${footX} ${footY}`} fill="none" stroke={from === 0 ? "#1b1d1a" : "#211e1b"} strokeWidth="2.5" strokeLinejoin="bevel" />
    <path d={`M${hipX} ${hipY - 0.5}L${kneeX} ${kneeY}L${footX} ${footY - 1}`} fill="none" stroke={from === 0 ? palette.h : palette.a} strokeWidth="1" strokeLinejoin="bevel" />
  </g>);
  return <>
    {legs(0, 4)}
    <g className="sky-mob-motion sky-spider-body">
      <Pixels rows={parts.abdomen} palette={palette} x={3} y={5} />
      <rect x="15" y="9" width="5" height="3" fill="#292622" />
      <Pixels rows={parts.head} palette={palette} x={18} y={7} />
    </g>
    {legs(4, 8)}
  </>;
}

function Skeleton() {
  const { parts, palette } = MOB_ART.skeleton;
  return <>
    <g className="sky-mob-motion sky-mob-leg sky-mob-leg-back" style={{ transformOrigin: "10px 20px" }}>
      <Pixels rows={parts.leg} palette={palette} x={9} y={20} />
    </g>
    <g className="sky-mob-motion sky-mob-leg" style={{ transformOrigin: "12px 20px" }}>
      <Pixels rows={parts.leg} palette={palette} x={11} y={20} />
    </g>
    <g className="sky-mob-motion sky-mob-body">
      <Pixels rows={parts.torso} palette={palette} x={7} y={8} />
      <Pixels rows={parts.head} palette={palette} x={7} />
      <g transform="rotate(72 11 11)">
        <g opacity="0.8">
          <Pixels rows={parts.arm} palette={palette} x={11} y={10} />
          <Pixels rows={parts.arm} palette={palette} x={18} y={10} />
          <rect x="24" y="10" width="2" height="3" fill={palette.b} />
        </g>
        <g transform="translate(26 11) scale(0.68) translate(-26 -11)">
          <Pixels rows={parts.bow} palette={palette} x={22} y={1} />
          <path d="M22 1v22" stroke={palette.t} strokeWidth="0.7" />
        </g>
        <g transform="rotate(18 11 11)">
          <Pixels rows={parts.arm} palette={palette} x={11} y={10} />
          <g transform="translate(18 11)">
            <Pixels rows={parts.arm} palette={palette} y={-1} />
          </g>
        </g>
      </g>
    </g>
  </>;
}

/** Les membres bougent autour de leurs articulations ; textures et proportions restent en pixels. */
export function SkyMob({ kind, unit, period, flip, still, className, style }: { kind: MobKind; unit: number; period: number; flip?: boolean; still?: boolean; className?: string; style?: CSSProperties }) {
  const { width, height, scale } = MOB_GEOMETRY[kind];
  return <svg width={width * unit * scale} height={height * unit * scale} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" className={cn("sky-mob block", still && "sky-mob-still", className)} style={{ "--mob-pace": `${period * 1.8}s`, ...(flip ? { transform: "scaleX(-1)" } : {}), ...style } as CSSProperties}>
    {kind === "zombie" || kind === "husk" ? <Zombie husk={kind === "husk"} /> : kind === "creeper" ? <Creeper /> : kind === "spider" ? <Spider /> : <Skeleton />}
  </svg>;
}
