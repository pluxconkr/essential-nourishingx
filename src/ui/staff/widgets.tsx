/**
 * Staff dashboard building blocks (web): page frame, section, KPI, bar row, table, daily chart, rule listing.
 * The phone's tokens — warm paper, hairlines, one crimson accent, no shadows — laid out for a desktop browser.
 * A state is never colour alone: every dot sits beside its word.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { TH } from '@/domain/rules';
import type { Clause, StateWord } from '@/domain/types';
import { t, tlist } from '@/i18n';
import { ts, type StaffKey } from '@/i18n/staff';
import type { DailyRow } from '@/services/staff';

import { Footnote, SectionLabel, Subhead } from '../primitives';
import { colors, radius, stateTone, tabular, text, tint } from '../theme';

export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** Runs `load` on mount and on reload(); `load` must be stable (a module function or a useCallback). */
export function useLoad<T>(load: () => Promise<T | null>): [Loaded<T>, () => Promise<void>] {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const settle = useCallback((data: T | null) => setState(data === null ? { status: 'error' } : { status: 'ready', data }), []);
  useEffect(() => {
    let live = true;
    void load()
      .catch(() => null)
      .then((data) => {
        if (live) settle(data);
      });
    return () => {
      live = false;
    };
  }, [load, settle]);
  const reload = useCallback(async () => settle(await load().catch(() => null)), [load, settle]);
  return [state, reload];
}

export const pct = (share: number | null | undefined) => (share == null ? '—' : `${Math.round(share * 100)}%`);
export const num = (x: number | null | undefined, digits = 1) => (x == null ? '—' : Number(x).toFixed(digits));
export const usd = (x: number) => `$${Number(x).toFixed(2)}`;

export function StaffPage({ title, subtitle, actions, children, testID }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; testID?: string }) {
  return (
    <View testID={testID}>
      <View style={styles.pageHead}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={text.largeTitle}>
            {title}
          </Text>
          {subtitle ? <Subhead style={{ marginTop: 4 }}>{subtitle}</Subhead> : null}
        </View>
        {actions}
      </View>
      {children}
    </View>
  );
}

export function Section({ title, foot, children, testID }: { title: string; foot?: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <SectionLabel style={{ marginBottom: 8 }}>{title}</SectionLabel>
      {children}
      {foot ? <Footnote style={{ marginTop: 8 }}>{foot}</Footnote> : null}
    </View>
  );
}

/** A card-like panel on paper (the phone's Card, without its bottom margin, for grids). */
export function Panel({ children, style, testID }: { children: ReactNode; style?: object; testID?: string }) {
  return (
    <View style={[styles.panel, style]} testID={testID}>
      {children}
    </View>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function Kpi({ label, value, foot, testID }: { label: string; value: string; foot: string; testID?: string }) {
  return (
    <View style={styles.kpi} testID={testID} accessible accessibilityLabel={`${label}: ${value}, ${foot}`}>
      <SectionLabel>{label}</SectionLabel>
      <Text style={[text.kpi, tabular, { marginTop: 6 }]}>{value}</Text>
      <Footnote style={{ marginTop: 2 }}>{foot}</Footnote>
    </View>
  );
}

export function BarRow({ label, share, value, color = tint }: { label: string; share: number; value: string; color?: string }) {
  return (
    <View style={styles.barRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[text.table, styles.barLabel]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, share)) * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[text.table, tabular, styles.barValue]}>{value}</Text>
    </View>
  );
}

export function Bullets({ keys }: { keys: readonly StaffKey[] }) {
  return (
    <View style={{ gap: 6 }}>
      {keys.map((k) => (
        <View key={k} style={styles.bullet}>
          <Text style={[text.subhead, { color: colors.ink3 }]}>•</Text>
          <Subhead style={{ flex: 1 }}>{ts(k)}</Subhead>
        </View>
      ))}
    </View>
  );
}

/** A plain table; null cells show "—" (suppressed or unknown). */
export function DataTable({ columns, rows, testID }: { columns: { label: string; flex?: number; numeric?: boolean }[]; rows: (string | number | null)[][]; testID?: string }) {
  return (
    <View style={styles.table} testID={testID} accessibilityRole="list">
      <View style={[styles.tr, styles.thead]}>
        {columns.map((c) => (
          <Text key={c.label} style={[text.tableHead, styles.td, { flex: c.flex ?? 1 }, c.numeric && styles.num]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[styles.tr, i < rows.length - 1 && styles.trLine]}>
          {r.map((cell, j) => (
            <Text key={j} style={[text.table, styles.td, { flex: columns[j].flex ?? 1 }, columns[j].numeric && [styles.num, tabular]]}>
              {cell == null ? '—' : String(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function StateCount({ state, n, testID }: { state: StateWord; n: number; testID?: string }) {
  const tone = stateTone[state];
  return (
    <View style={[styles.stateCount, { backgroundColor: tone.soft }]} testID={testID} accessible accessibilityLabel={`${t(`state.${state}`)}: ${n}`}>
      <View style={styles.stateLine}>
        <View style={[styles.dot, { backgroundColor: tone.dot }]} />
        <Text style={[text.headline, { color: tone.text }]}>{t(`state.${state}`)}</Text>
      </View>
      <Text style={[text.kpi, tabular, { marginTop: 4 }]}>{n}</Text>
    </View>
  );
}

const SERIES: { key: 'avg_energy' | 'avg_fullness' | 'avg_focus'; label: StaffKey; color: string }[] = [
  { key: 'avg_energy', label: 'legend.energy', color: tint },
  { key: 'avg_fullness', label: 'legend.fullness', color: colors.green },
  { key: 'avg_focus', label: 'legend.focus', color: colors.amberBar },
];

/** Daily means on the 1–5 scale; a suppressed day (null) breaks the line instead of drawing a guess. */
export function DailyChart({ rows }: { rows: DailyRow[] }) {
  const [width, setWidth] = useState(0);
  const H = 200;
  const pad = { l: 30, r: 10, t: 10, b: 26 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (rows.length > 1 ? (i / (rows.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => pad.t + ((5 - v) / 4) * plotH;
  const months = tlist('time.months');
  const label = (day: string) => `${months[Number(day.slice(5, 7)) - 1].slice(0, 3)} ${Number(day.slice(8, 10))}`;
  const path = (key: (typeof SERIES)[number]['key']) => {
    let d = '';
    let pen = false;
    rows.forEach((r, i) => {
      const v = r[key];
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(v)).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={ts('overview.daily.title')}>
      {width > 0 ? (
        <Svg width={width} height={H}>
          {[1, 2, 3, 4, 5].map((v) => (
            <Line key={v} x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={colors.line} strokeWidth={1} />
          ))}
          {[1, 2, 3, 4, 5].map((v) => (
            <SvgText key={`l${v}`} x={pad.l - 10} y={y(v) + 4} fill={colors.ink3} fontSize={text.footnote.fontSize} textAnchor="end">
              {v}
            </SvgText>
          ))}
          {rows.map((r, i) =>
            i % 7 === rows.length % 7 || i === rows.length - 1 ? (
              <SvgText key={r.day} x={x(i)} y={H - 6} fill={colors.ink3} fontSize={text.footnote.fontSize} textAnchor={i === rows.length - 1 ? 'end' : 'middle'}>
                {label(r.day)}
              </SvgText>
            ) : null,
          )}
          {SERIES.map((s) => (
            <Path key={s.key} d={path(s.key)} stroke={s.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}
      <View style={styles.legend}>
        {SERIES.map((s) => (
          <View key={s.key} style={styles.stateLine}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Footnote>{ts(s.label)}</Footnote>
          </View>
        ))}
      </View>
    </View>
  );
}

export const CLAUSES: readonly Clause[] = ['A', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'D'];

/** One clause in threshold form, with its numbers read from TH (the rules' single source). */
export function clauseText(c: Clause): string {
  switch (c) {
    case 'A':
      return ts('clause.A', { n: TH.minCheckins });
    case 'B1':
      return ts('clause.B1', { s: TH.b1_skipped, h: TH.b1_heavy });
    case 'B2':
      return ts('clause.B2', { e: TH.b2_lowEnergy, d: Math.abs(TH.b2_fullDelta).toFixed(1) });
    case 'B3':
      return ts('clause.B3', { s: TH.b3_skipped, h: TH.b3_heavy, d: Math.abs(TH.b3_fullDelta).toFixed(1), m: TH.b3_energyMean });
    case 'C1':
      return ts('clause.C1', { s: TH.c1_skipped, h: TH.c1_heavy });
    case 'C2':
      return ts('clause.C2', { e: TH.c2_lowEnergy, s: TH.c2_skipped });
    case 'C3':
      return ts('clause.C3', { d: Math.abs(TH.c3_fullDelta).toFixed(1), h: TH.c3_heavy });
    case 'C4':
      return ts('clause.C4', { f: TH.c4_lowFocus, s: TH.c4_skipped });
    case 'C5':
      return ts('clause.C5', { m: TH.c5_minMeals, share: `${TH.c5_lowShare * 4} in 4`, p: TH.meal_lowProtein_g });
    case 'C6':
      return ts('clause.C6', { k: TH.c6_heavyDaysLowCarb, c: TH.c6_lowCarb_g });
    case 'D':
      return ts('clause.D');
  }
}

/** The rules in evaluation order; the firing clause is highlighted in its state's tone. */
export function RuleListing({ firing, state, testID }: { firing?: Clause; state?: StateWord; testID?: string }) {
  return (
    <View style={styles.code} testID={testID}>
      {CLAUSES.map((c) => {
        const on = c === firing;
        return (
          <View key={c} style={[styles.codeLine, on && { backgroundColor: stateTone[state ?? 'stable'].soft, borderLeftColor: stateTone[state ?? 'stable'].dot }]} accessibilityState={{ selected: on }}>
            <Text style={[text.mono, styles.codeClause, on && { color: stateTone[state ?? 'stable'].text }]}>{c}</Text>
            <Text style={[text.mono, { flex: 1 }]}>{clauseText(c)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pageHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginBottom: 20 },
  section: { marginBottom: 24 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { flexGrow: 1, flexBasis: 128, maxWidth: 260, backgroundColor: colors.surface, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 14 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  barLabel: { width: 190 },
  track: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  barValue: { width: 64, textAlign: 'right' },
  bullet: { flexDirection: 'row', gap: 8 },
  table: { backgroundColor: colors.surface, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, overflow: 'hidden' },
  tr: { flexDirection: 'row', paddingHorizontal: 12 },
  thead: { backgroundColor: colors.surface2 },
  trLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  td: { paddingVertical: 9, paddingRight: 10 },
  num: { textAlign: 'right' },
  stateCount: { flexGrow: 1, flexBasis: 150, borderRadius: radius.m, padding: 14 },
  stateLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legend: { flexDirection: 'row', gap: 18, marginTop: 6, paddingLeft: 30 },
  code: { backgroundColor: colors.surface, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingVertical: 6 },
  codeLine: { flexDirection: 'row', gap: 12, paddingVertical: 3, paddingHorizontal: 12, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  codeClause: { width: 28, color: colors.ink3 },
});
