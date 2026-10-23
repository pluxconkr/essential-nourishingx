/**
 * /staff/menu · Menu performance: what participants photographed in the last 7 days (staff_meals, n ≥ 10 per meal and
 * per food group), the actions Dining Services can take when an average falls below published guidance, and the menu
 * phones show today. Estimates, not measurements; photos are optional and self-selected.
 */
import { useMemo } from 'react';
import { View } from 'react-native';

import { dateKey } from '@/domain/time';
import type { Meal, MenuDay } from '@/domain/types';
import { t } from '@/i18n';
import { ts, type StaffKey } from '@/i18n/staff';
import { menuForToday } from '@/services/menu';
import { menuRows, staffMeals, type MealsSummary } from '@/services/staff';
import { Callout, Footnote, Subhead } from '@/ui/primitives';
import { BarRow, DataTable, Grid, Panel, Section, StaffPage, num, pct, useLoad } from '@/ui/staff/widgets';
import { colors } from '@/ui/theme';

// Jäger et al. 2017 (ISSN, PMID 28642676): 20–40 g protein per meal. docs/sources.md "Guidance shown to students".
const PROTEIN_PER_MEAL_G = 20;
// DRI carbohydrate RDA 130 g/day for every age from 1 year, about 43 g per meal over three meals (docs/thresholds.md).
const CARBS_PER_MEAL_G = 130 / 3;

const loadMeals = () => staffMeals(7);

/** Suggestions only where an average photographed meal falls below the cited guidance; never a target for a student. */
function actions(m: MealsSummary): string[] {
  const slot = (meal: Meal) => m.by_meal?.find((r) => r.meal === meal && !r.suppressed);
  const out: string[] = [];
  const breakfast = slot('breakfast');
  if (breakfast?.avg_protein_g != null && Number(breakfast.avg_protein_g) < PROTEIN_PER_MEAL_G) out.push(ts('menu.action.protein', { p: num(breakfast.avg_protein_g, 0) }));
  const dinner = slot('dinner');
  if (dinner?.avg_carbs_g != null && Number(dinner.avg_carbs_g) < CARBS_PER_MEAL_G) out.push(ts('menu.action.carbs', { c: num(dinner.avg_carbs_g, 0) }));
  return out;
}

export default function StaffMenu() {
  const [meals] = useLoad(loadMeals);
  const [menus] = useLoad(menuRows);
  const m = meals.status === 'ready' ? meals.data : null;

  const entered = useMemo(() => (menus.status === 'ready' ? Object.fromEntries(menus.data.map((r) => [r.key, r.meals])) : {}) as Record<string, MenuDay>, [menus]);
  const today = dateKey();
  const todayMenu = (['breakfast', 'lunch', 'dinner'] as const).map((meal, i) => ({ meal, menu: menuForToday(today, [8, 12, 18][i], entered) }));

  return (
    <StaffPage title={ts('menu.title')} subtitle={ts('menu.subtitle')} testID="staff-menu">
      {meals.status === 'error' ? <Callout icon="info">{ts('common.unavailable')}</Callout> : null}
      {m?.suppressed ? <Callout icon="lock">{ts('common.suppressed')}</Callout> : null}

      {m && !m.suppressed ? (
        <>
          <Section title={ts('menu.slots.title')} foot={ts('menu.slots.foot')}>
            <DataTable
              testID="menu-slots"
              columns={[{ label: ts('col.meal'), flex: 1.2 }, { label: ts('col.photos'), numeric: true }, { label: ts('col.participants'), numeric: true }, { label: ts('col.kcal'), numeric: true }, { label: ts('col.protein'), numeric: true }, { label: ts('col.carbs'), numeric: true }, { label: ts('col.fat'), numeric: true }, { label: ts('col.fiber'), numeric: true }]}
              rows={(m.by_meal ?? []).map((r) => [
                r.meal === 'snack' ? t('meal.slot.snack') : t(`time.meal.${r.meal as Exclude<Meal, 'snack'>}`),
                r.analyses,
                r.students,
                r.suppressed ? null : num(r.avg_kcal, 0),
                r.suppressed ? null : num(r.avg_protein_g),
                r.suppressed ? null : num(r.avg_carbs_g),
                r.suppressed ? null : num(r.avg_fat_g),
                r.suppressed ? null : num(r.avg_fiber_g),
              ])}
            />
          </Section>

          <Section title={ts('menu.groups.title')} foot={ts('menu.groups.foot')}>
            <Panel>
              {(m.groups ?? []).map((g) => (
                <BarRow key={g.group} label={ts(`group.${g.group}` as StaffKey)} share={g.share} value={pct(g.share)} color={colors.green} />
              ))}
            </Panel>
          </Section>

          <Section title={ts('menu.actions.title')} foot={ts('menu.caveat')}>
            <Panel testID="menu-actions">
              {actions(m).length ? (
                actions(m).map((a) => (
                  <Subhead key={a} style={{ color: colors.ink, marginBottom: 8 }}>
                    {a}
                  </Subhead>
                ))
              ) : (
                <Subhead>{ts('menu.action.none')}</Subhead>
              )}
            </Panel>
          </Section>
        </>
      ) : null}

      <Section title={ts('menu.today.title')} foot={ts('menu.today.foot')}>
        <Grid>
          {todayMenu.map(({ meal, menu }) => (
            <Panel key={meal} style={{ flexGrow: 1, flexBasis: 240 }}>
              <Subhead style={{ color: colors.ink, marginBottom: 6 }}>{`${t(`time.meal.${meal}`)} · ${menu?.source === 'today' ? t('home.menu.footnote.today', { n: menu.items.length }) : t('home.menu.footnote.template', { n: menu?.items.length ?? 0 })}`}</Subhead>
              <View style={{ gap: 2 }}>
                {(menu?.items ?? []).map((it) => (
                  <Footnote key={it.item}>{`${it.item} · ${it.station}`}</Footnote>
                ))}
              </View>
            </Panel>
          ))}
        </Grid>
      </Section>
    </StaffPage>
  );
}
