import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';

const TARGETS = [
  { size: 8, pts: 1 },
  { size: 6, pts: 2 },
  { size: 4, pts: 3 },
];
const STRINGS_PER_MATCH = 5;
const SHOTS_PER_STRING = 10;
const STRING_TIME_LIMIT_SECONDS = 3 * 60;
const STORAGE_KEY = '@long-gong-scoring/v1';

const initialState = {
  shooters: [],
  stringNo: 0,
  orderEntries: [],
  shooterPos: 0,
  current: null,
  selected: 8,
  started: false,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function total(shooter) {
  return shooter.strings.reduce((sum, item) => sum + item.score, 0);
}

function tieCompare(a, b) {
  const A = a.strings.map((x) => x.score);
  const B = b.strings.map((x) => x.score);
  const max = Math.max(...A, ...B, 0);

  for (let score = max; score >= 0; score -= 1) {
    const ai = A.indexOf(score);
    const bi = B.indexOf(score);
    if (ai !== bi) {
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    }
  }
  return a.entry - b.entry;
}

function standings(shooters) {
  return [...shooters].sort((a, b) => total(b) - total(a) || tieCompare(a, b));
}

function isComplete(state) {
  return (
    state.stringNo > STRINGS_PER_MATCH &&
    state.shooters.length > 0 &&
    state.shooters.every((s) => s.strings.length === STRINGS_PER_MATCH)
  );
}

function highRawScore(shooters) {
  return shooters.length ? Math.max(...shooters.map(total)) : 0;
}

function matchPoints(shooter, shooters) {
  const high = highRawScore(shooters);
  return high > 0 ? (total(shooter) / high) * 100 : 0;
}

function fmtPoints(n) {
  return Number(n.toFixed(2)).toString();
}

function formatStringTime(totalSeconds) {
  const seconds = Math.max(0, Math.min(STRING_TIME_LIMIT_SECONDS, Math.round(totalSeconds || 0)));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function makeFinalScoresRows(state) {
  const ranked = standings(state.shooters);
  return ranked.map((shooter, index) => ({
    rank: index + 1,
    shooter: shooter.name,
    totalMatchPoints: total(shooter),
    seriesPoints: fmtPoints(matchPoints(shooter, state.shooters)),
  }));
}

function makeFinalScoresCSV(state) {
  const rows = [['Rank', 'Shooter', 'Total Match Points', 'Series Points']];
  for (const row of makeFinalScoresRows(state)) {
    rows.push([row.rank, row.shooter, row.totalMatchPoints, row.seriesPoints]);
  }
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

function makeCSV(state) {
  const rows = [];
  rows.push([
    'Record Type',
    'Rank',
    'Shooter',
    'String',
    'Shot',
    'Target Inches',
    'Impact',
    'Shot Points',
    'Shot Time Used',
    'Shot Time Seconds',
    'String Score',
    'String Time Used',
    'String Time Seconds',
    'Raw Match Score',
    'Total Time Used',
    'Total Time Seconds',
    'Series Points',
  ]);

  const ranked = standings(state.shooters);
  const rankMap = new Map(ranked.map((s, i) => [s.entry, i + 1]));

  for (const shooter of ranked) {
    const raw = total(shooter);
    const totalTimeSeconds = shooter.strings.reduce((sum, item) => sum + (item.timeUsedSeconds ?? 0), 0);
    const mp = fmtPoints(matchPoints(shooter, state.shooters));
    for (const string of shooter.strings) {
      const stringTimeSeconds = string.timeUsedSeconds ?? 0;
      for (const shot of string.shots) {
        rows.push([
          'SHOT',
          rankMap.get(shooter.entry),
          shooter.name,
          string.number,
          shot.shot,
          shot.size,
          shot.hit ? 'HIT' : 'MISS',
          shot.pts,
          formatStringTime(shot.timeUsedSeconds ?? 0),
          shot.timeUsedSeconds ?? 0,
          string.score,
          formatStringTime(stringTimeSeconds),
          stringTimeSeconds,
          raw,
          formatDuration(totalTimeSeconds),
          totalTimeSeconds,
          mp,
        ]);
      }
    }
  }

  for (const shooter of ranked) {
    const totalTimeSeconds = shooter.strings.reduce((sum, item) => sum + (item.timeUsedSeconds ?? 0), 0);
    rows.push([
      'FINAL',
      rankMap.get(shooter.entry),
      shooter.name,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      shooter.strings.map((x) => x.score).join(' / '),
      shooter.strings.map((x) => formatStringTime(x.timeUsedSeconds ?? 0)).join(' / '),
      shooter.strings.map((x) => x.timeUsedSeconds ?? 0).join(' / '),
      total(shooter),
      formatDuration(totalTimeSeconds),
      totalTimeSeconds,
      fmtPoints(matchPoints(shooter, state.shooters)),
    ]);
  }

  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

function Button({ title, onPress, disabled, tone = 'default', selected = false, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${tone}`],
        selected && styles.buttonSelected,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        style,
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  const [state, setState] = useState(initialState);
  const [undoStack, setUndoStack] = useState([]);
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(STRING_TIME_LIMIT_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerEndAt, setTimerEndAt] = useState(null);
  const summaryReportRef = useRef(null);
  const { width } = useWindowDimensions();
  const isTablet = width >= 760;

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.state) setState(parsed.state);
          if (Array.isArray(parsed?.undoStack)) setUndoStack(parsed.undoStack);
          if (parsed?.timer) {
            const savedRemaining = Math.max(0, Math.min(STRING_TIME_LIMIT_SECONDS, parsed.timer.remaining ?? STRING_TIME_LIMIT_SECONDS));
            if (parsed.timer.running && parsed.timer.endAt) {
              const liveRemaining = Math.max(0, Math.ceil((parsed.timer.endAt - Date.now()) / 1000));
              setTimerRemaining(liveRemaining);
              setTimerRunning(liveRemaining > 0);
              setTimerEndAt(liveRemaining > 0 ? parsed.timer.endAt : null);
            } else {
              setTimerRemaining(savedRemaining);
              setTimerRunning(false);
              setTimerEndAt(null);
            }
          }
        }
      } catch (error) {
        console.warn('Unable to restore saved match', error);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            state,
            undoStack,
            timer: { remaining: timerRemaining, running: timerRunning, endAt: timerEndAt },
          }),
        );
      } catch (error) {
        console.warn('Unable to save match', error);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [state, undoStack, timerRemaining, timerRunning, timerEndAt, loaded]);

  const ranked = useMemo(() => standings(state.shooters), [state.shooters]);
  const complete = isComplete(state);

  useEffect(() => {
    if (!timerRunning || !timerEndAt) return undefined;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        setTimerRunning(false);
        setTimerEndAt(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [timerRunning, timerEndAt]);

  function effectiveTimerRemaining() {
    if (timerRunning && timerEndAt) {
      return Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    }
    return timerRemaining;
  }

  function timeUsedSeconds() {
    return Math.min(STRING_TIME_LIMIT_SECONDS, STRING_TIME_LIMIT_SECONDS - effectiveTimerRemaining());
  }

  function resetShooterTimer() {
    setTimerRemaining(STRING_TIME_LIMIT_SECONDS);
    setTimerRunning(false);
    setTimerEndAt(null);
  }

  function toggleTimer() {
    if (!state.current || complete || timerRemaining <= 0) return;

    if (timerRunning) {
      const remaining = effectiveTimerRemaining();
      setTimerRemaining(remaining);
      setTimerRunning(false);
      setTimerEndAt(null);
    } else {
      const endAt = Date.now() + timerRemaining * 1000;
      setTimerEndAt(endAt);
      setTimerRunning(true);
    }
  }

  function addShooter() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.started) {
      Alert.alert('Match already started', 'Reset the match before changing the shooter roster.');
      return;
    }
    setState((prev) => ({
      ...prev,
      shooters: [...prev.shooters, { name: trimmed, strings: [], entry: prev.shooters.length }],
    }));
    setName('');
  }

  function removeShooter(entry) {
    if (state.started) return;
    setState((prev) => {
      const next = prev.shooters
        .filter((s) => s.entry !== entry)
        .map((s, index) => ({ ...s, entry: index }));
      return { ...prev, shooters: next };
    });
  }

  function beginShooter(base) {
    if (base.stringNo > STRINGS_PER_MATCH) {
      return { ...base, current: null };
    }
    if (base.shooterPos >= base.orderEntries.length) {
      return advanceString(base);
    }

    const entry = base.orderEntries[base.shooterPos];
    const shooter = base.shooters.find((s) => s.entry === entry);
    return {
      ...base,
      current: { shooterEntry: shooter.entry, shots: [], score: 0, maxIdx: 0 },
      selected: 8,
    };
  }

  function advanceString(base) {
    if (base.stringNo >= STRINGS_PER_MATCH) {
      return { ...base, stringNo: STRINGS_PER_MATCH + 1, current: null };
    }

    const nextString = base.stringNo + 1;
    const nextOrder = [...base.shooters]
      .sort((a, b) => {
        const sa = a.strings[nextString - 2]?.score ?? 0;
        const sb = b.strings[nextString - 2]?.score ?? 0;
        if (sb !== sa) return sb - sa;
        return tieCompare(a, b);
      })
      .map((s) => s.entry);

    return beginShooter({
      ...base,
      stringNo: nextString,
      orderEntries: nextOrder,
      shooterPos: 0,
      current: null,
      selected: 8,
    });
  }

  function actuallyStartMatch() {
    const resetShooters = state.shooters.map((s) => ({ ...s, strings: [] }));
    const base = {
      shooters: resetShooters,
      stringNo: 1,
      orderEntries: resetShooters.map((s) => s.entry),
      shooterPos: 0,
      current: null,
      selected: 8,
      started: true,
    };
    setUndoStack([]);
    resetShooterTimer();
    setState(beginShooter(base));
  }

  function startMatch() {
    if (!state.shooters.length) return;
    if (state.started) {
      Alert.alert(
        'Reset current match?',
        'This clears all scored strings and starts again with the current roster.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset Match', style: 'destructive', onPress: actuallyStartMatch },
        ],
      );
    } else {
      actuallyStartMatch();
    }
  }

  function selectTarget(size) {
    setState((prev) => ({ ...prev, selected: size }));
  }

  function record(hit) {
    const prev = state;
    if (!prev.current || prev.current.shots.length >= SHOTS_PER_STRING) return;
    const idx = TARGETS.findIndex((t) => t.size === prev.selected);
    if (idx < 0 || idx > prev.current.maxIdx) return;

    // The first scored shot of every string automatically starts the shooter timer.
    // Either a HIT or MISS counts as the first scored shot. Undo does not alter timer state.
    if (prev.current.shots.length === 0 && !timerRunning && timerRemaining > 0) {
      const endAt = Date.now() + timerRemaining * 1000;
      setTimerEndAt(endAt);
      setTimerRunning(true);
    }

    const snapshot = clone(prev);
    const target = TARGETS[idx];
    const shotTimeUsedSeconds = timeUsedSeconds();
    const shot = {
      shot: prev.current.shots.length + 1,
      size: target.size,
      pts: hit ? target.pts : 0,
      hit,
      timeUsedSeconds: shotTimeUsedSeconds,
    };

    let maxIdx = prev.current.maxIdx;
    let score = prev.current.score;
    if (hit) {
      score += target.pts;
      if (idx === maxIdx && maxIdx < TARGETS.length - 1) maxIdx += 1;
    } else {
      // Miss rule: next larger target becomes the smallest available target.
      // 4" miss -> 6"; 6" miss -> 8"; 8" miss -> 8".
      maxIdx = Math.max(0, idx - 1);
    }

    const shots = [...prev.current.shots, shot];
    const selected = hit ? TARGETS[Math.min(idx, maxIdx)].size : TARGETS[maxIdx].size;

    let next = {
      ...prev,
      selected,
      current: { ...prev.current, shots, score, maxIdx },
    };

    if (shots.length === SHOTS_PER_STRING) {
      const shooterEntry = prev.current.shooterEntry;
      const shooters = prev.shooters.map((s) =>
        s.entry === shooterEntry
          ? {
              ...s,
              strings: [
                ...s.strings,
                {
                  number: prev.stringNo,
                  score,
                  shots: clone(shots),
                  timeUsedSeconds: timeUsedSeconds(),
                },
              ],
            }
          : s,
      );
      next = beginShooter({
        ...next,
        shooters,
        shooterPos: prev.shooterPos + 1,
        current: null,
      });
    }

    setUndoStack((stack) => [...stack, snapshot]);
    setState(next);
    if (shots.length === SHOTS_PER_STRING) resetShooterTimer();
  }

  function undoLastShot() {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setState(previous);
      return stack.slice(0, -1);
    });
  }

  async function exportMatchCSV() {
    if (!complete) return;
    try {
      const csv = makeCSV(state);
      const stamp = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `long-gong-results-${stamp}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          dialogTitle: 'Export Long Gong match results',
          mimeType: 'text/csv',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Export saved', file.uri);
      }
    } catch (error) {
      Alert.alert('Export failed', error?.message ?? String(error));
    }
  }

  async function exportFinalScoresReport() {
    if (!complete) return;
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const csv = makeFinalScoresCSV(state);
      const csvFile = new File(Paths.cache, `long-gong-final-scores-${stamp}.csv`);
      if (csvFile.exists) csvFile.delete();
      csvFile.create();
      csvFile.write(csv);

      let pngUri = null;
      if (summaryReportRef.current?.capture) {
        pngUri = await summaryReportRef.current.capture();
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(csvFile.uri, {
          dialogTitle: 'Export final match scores CSV',
          mimeType: 'text/csv',
          UTI: 'public.comma-separated-values-text',
        });

        if (pngUri) {
          await Sharing.shareAsync(pngUri, {
            dialogTitle: 'Export final match scores PNG',
            mimeType: 'image/png',
            UTI: 'public.png',
          });
        }
      } else {
        const parts = [`CSV: ${csvFile.uri}`];
        if (pngUri) parts.push(`PNG: ${pngUri}`);
        Alert.alert('Exports saved', parts.join('\n'));
      }
    } catch (error) {
      Alert.alert('Export failed', error?.message ?? String(error));
    }
  }

  async function clearSavedMatch() {
    Alert.alert('Clear all match data?', 'This removes the roster and all scores stored on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(STORAGE_KEY);
          setUndoStack([]);
          resetShooterTimer();
          setState(initialState);
        },
      },
    ]);
  }

  const currentShooter = state.current
    ? state.shooters.find((s) => s.entry === state.current.shooterEntry)
    : null;
  const eligibleTargets = state.current ? TARGETS.slice(0, state.current.maxIdx + 1) : [];

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.loading}><Text style={styles.muted}>Loading match…</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.page, isTablet && styles.pageTablet]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Long Gong Scoring</Text>
          <Text style={styles.subtitle}>5 strings • 10 shots • 8\", 6\", 4\" targets</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Match Setup</Text>
          <View style={styles.row}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={addShooter}
              editable={!state.started}
              placeholder="Shooter name"
              placeholderTextColor="#6b7280"
              style={[styles.input, isTablet && styles.inputTablet]}
              returnKeyType="done"
            />
            <Button title="Add Shooter" onPress={addShooter} disabled={state.started || !name.trim()} />
          </View>

          <View style={styles.row}>
            <Button title={state.started ? 'Reset Match' : 'Start Match'} onPress={startMatch} disabled={!state.shooters.length} />
            <Button title="Export Results CSV" onPress={exportMatchCSV} disabled={!complete} tone="export" />
            <Button title="Export Final Scores" onPress={exportFinalScoresReport} disabled={!complete} tone="export" />
            <Button title="Clear Saved Data" onPress={clearSavedMatch} tone="danger" />
          </View>
          <Text style={styles.note}>Match progress is saved automatically on this device. Export buttons are enabled after all 5 strings are complete.</Text>

          <View style={styles.roster}>
            {state.shooters.length === 0 ? (
              <Text style={styles.muted}>No shooters added.</Text>
            ) : (
              state.shooters.map((shooter, index) => (
                <View key={shooter.entry} style={styles.rosterRow}>
                  <Text style={styles.rosterName}>{index + 1}. {shooter.name}</Text>
                  {!state.started && (
                    <Pressable onPress={() => removeShooter(shooter.entry)}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scoring</Text>
          {!state.current ? (
            <>
              <Text style={complete ? styles.complete : styles.muted}>
                {complete ? 'Match complete' : state.started ? 'Preparing next shooter…' : 'Add shooters, then start the match.'}
              </Text>
              {undoStack.length > 0 && <Button title="Undo Last Shot" onPress={undoLastShot} tone="undo" style={styles.undoSolo} />}
            </>
          ) : (
            <>
              <Text style={styles.currentShooter}>String {state.stringNo}/{STRINGS_PER_MATCH} — {currentShooter?.name}</Text>
              <Text style={styles.scoreLine}>Shot {state.current.shots.length + 1}/{SHOTS_PER_STRING} • Score {state.current.score}</Text>

              <View style={styles.timerPanel}>
                <View>
                  <Text style={styles.timerLabel}>Shooter Timer</Text>
                  <Text style={[styles.timerText, timerRemaining === 0 && styles.timerExpired]}>
                    {formatStringTime(timerRemaining)}
                  </Text>
                  <Text style={styles.timerUsed}>Time used: {formatStringTime(timeUsedSeconds())}</Text>
                </View>
                <Button
                  title={timerRunning ? 'Stop Timer' : timerRemaining === 0 ? 'Time Expired' : 'Start Timer'}
                  onPress={toggleTimer}
                  disabled={timerRemaining === 0}
                  tone={timerRunning ? 'timerStop' : 'timerStart'}
                  style={styles.timerButton}
                />
              </View>

              <Text style={styles.sectionLabel}>Available target</Text>
              <View style={styles.row}>
                {eligibleTargets.map((target) => (
                  <Button
                    key={target.size}
                    title={`${target.size}\" • ${target.pts} pt${target.pts > 1 ? 's' : ''}`}
                    onPress={() => selectTarget(target.size)}
                    tone="target"
                    selected={state.selected === target.size}
                    style={isTablet ? styles.targetTablet : undefined}
                  />
                ))}
              </View>

              <View style={[styles.row, styles.scoringActions]}>
                <Button title="IMPACT" onPress={() => record(true)} tone="hit" style={[styles.scoreButton, isTablet && styles.scoreButtonTablet]} />
                <Button title="MISS" onPress={() => record(false)} tone="miss" style={[styles.scoreButton, isTablet && styles.scoreButtonTablet]} />
                <Button title="Undo Last Shot" onPress={undoLastShot} disabled={!undoStack.length} tone="undo" style={[styles.scoreButton, isTablet && styles.scoreButtonTablet]} />
              </View>

              <View style={styles.shotHistory}>
                {state.current.shots.length === 0 ? (
                  <Text style={styles.muted}>No shots recorded in this string yet.</Text>
                ) : (
                  state.current.shots.map((shot) => (
                    <View key={shot.shot} style={styles.shotChip}>
                      <Text style={styles.shotText}>#{shot.shot} • {shot.size}\" • {shot.hit ? `HIT +${shot.pts}` : 'MISS'}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Leaderboard</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.rankCell, styles.headerCell]}>#</Text>
            <Text style={[styles.cell, styles.nameCell, styles.headerCell]}>Shooter</Text>
            <Text style={[styles.cell, styles.stringsCell, styles.headerCell]}>Strings</Text>
            <Text style={[styles.cell, styles.totalCell, styles.headerCell]}>Raw</Text>
            <Text style={[styles.cell, styles.timeCell, styles.headerCell]}>Time</Text>
            <Text style={[styles.cell, styles.pointsCell, styles.headerCell]}>Series</Text>
          </View>
          {ranked.map((shooter, index) => (
            <View key={shooter.entry} style={styles.tableRow}>
              <Text style={[styles.cell, styles.rankCell]}>{index + 1}</Text>
              <Text style={[styles.cell, styles.nameCell]} numberOfLines={2}>{shooter.name}</Text>
              <Text style={[styles.cell, styles.stringsCell]} numberOfLines={2}>{shooter.strings.map((x) => x.score).join(' / ') || '—'}</Text>
              <Text style={[styles.cell, styles.totalCell, styles.bold]}>{total(shooter)}</Text>
              <Text style={[styles.cell, styles.timeCell]}>{formatDuration(shooter.strings.reduce((sum, item) => sum + (item.timeUsedSeconds ?? 0), 0))}</Text>
              <Text style={[styles.cell, styles.pointsCell, complete && styles.bold]}>{complete ? fmtPoints(matchPoints(shooter, state.shooters)) : '—'}</Text>
            </View>
          ))}
          {complete && (
            <Text style={styles.note}>Series points: highest raw score = 100.00. All others = (shooter raw score ÷ highest raw score) × 100.</Text>
          )}
        </View>

        {complete && (
          <View style={styles.card}>
            <View style={styles.reportActionRow}>
              <Text style={styles.cardTitle}>Final Match Scores Report</Text>
              <Button title="Export Final Scores (CSV + PNG)" onPress={exportFinalScoresReport} tone="export" />
            </View>
            <Text style={styles.note}>This export creates a simple final scores table with rank, shooter, total match points, and series points.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <ViewShot ref={summaryReportRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                <View style={styles.summaryReport}>
                  <Text style={styles.summaryTitle}>Long Gong Scoring</Text>
                  <Text style={styles.summarySubtitle}>Final Match Scores</Text>
                  <View style={styles.summaryHeaderRow}>
                    <Text style={[styles.summaryCell, styles.summaryRank, styles.summaryHeaderText]}>Rank</Text>
                    <Text style={[styles.summaryCell, styles.summaryShooter, styles.summaryHeaderText]}>Shooter</Text>
                    <Text style={[styles.summaryCell, styles.summaryTotal, styles.summaryHeaderText]}>Total Match Points</Text>
                    <Text style={[styles.summaryCell, styles.summarySeries, styles.summaryHeaderText]}>Series Points</Text>
                  </View>
                  {makeFinalScoresRows(state).map((row) => (
                    <View key={`${row.rank}-${row.shooter}`} style={styles.summaryDataRow}>
                      <Text style={[styles.summaryCell, styles.summaryRank]}>{row.rank}</Text>
                      <Text style={[styles.summaryCell, styles.summaryShooter]} numberOfLines={1}>{row.shooter}</Text>
                      <Text style={[styles.summaryCell, styles.summaryTotal]}>{row.totalMatchPoints}</Text>
                      <Text style={[styles.summaryCell, styles.summarySeries]}>{row.seriesPoints}</Text>
                    </View>
                  ))}
                </View>
              </ViewShot>
            </ScrollView>
          </View>
        )}

        <Text style={styles.footer}>Long Gong Scoring • Offline-ready match scoring</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111827' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { padding: 14, paddingBottom: 40, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  pageTablet: { padding: 24 },
  header: { paddingVertical: 12, paddingHorizontal: 4 },
  title: { color: '#f9fafb', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#9ca3af', marginTop: 4, fontSize: 15 },
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: '#f9fafb', fontSize: 21, fontWeight: '800', marginBottom: 12 },
  currentShooter: { color: '#f9fafb', fontSize: 24, fontWeight: '800' },
  scoreLine: { color: '#d1d5db', fontSize: 17, marginTop: 5, marginBottom: 16 },
  sectionLabel: { color: '#d1d5db', fontWeight: '700', marginBottom: 8 },
  timerPanel: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#374151', padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  timerLabel: { color: '#9ca3af', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  timerText: { color: '#f9fafb', fontSize: 42, lineHeight: 48, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timerExpired: { color: '#fca5a5' },
  timerUsed: { color: '#cbd5e1', fontSize: 13, marginTop: 2 },
  timerButton: { minWidth: 120 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 },
  input: { minWidth: 190, flexGrow: 1, color: '#f9fafb', backgroundColor: '#111827', borderWidth: 1, borderColor: '#4b5563', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: 16 },
  inputTablet: { maxWidth: 420 },
  button: { backgroundColor: '#374151', borderWidth: 1, borderColor: '#4b5563', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, minHeight: 46, justifyContent: 'center' },
  button_default: { backgroundColor: '#374151' },
  button_target: { backgroundColor: '#374151' },
  button_hit: { backgroundColor: '#166534', borderColor: '#15803d' },
  button_miss: { backgroundColor: '#991b1b', borderColor: '#b91c1c' },
  button_undo: { backgroundColor: '#92400e', borderColor: '#b45309' },
  button_export: { backgroundColor: '#075985', borderColor: '#0369a1' },
  button_timerStart: { backgroundColor: '#1d4ed8', borderColor: '#2563eb' },
  button_timerStop: { backgroundColor: '#9a3412', borderColor: '#c2410c' },
  button_danger: { backgroundColor: '#4b5563', borderColor: '#6b7280' },
  buttonSelected: { borderColor: '#fbbf24', borderWidth: 3, paddingHorizontal: 12, paddingVertical: 10 },
  buttonDisabled: { opacity: 0.38 },
  buttonPressed: { opacity: 0.72 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  targetTablet: { minWidth: 150 },
  scoringActions: { marginTop: 8 },
  scoreButton: { flexGrow: 1, minWidth: 110 },
  scoreButtonTablet: { minHeight: 72, minWidth: 190 },
  undoSolo: { marginTop: 14, alignSelf: 'flex-start' },
  roster: { marginTop: 4 },
  rosterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#374151' },
  rosterName: { color: '#f3f4f6', fontSize: 16, flex: 1 },
  removeText: { color: '#fca5a5', fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4 },
  note: { color: '#cbd5e1', fontSize: 13, lineHeight: 19, marginTop: 4 },
  muted: { color: '#9ca3af' },
  complete: { color: '#86efac', fontWeight: '800', fontSize: 18 },
  shotHistory: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  shotChip: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  shotText: { color: '#d1d5db', fontSize: 13 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#4b5563', paddingBottom: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#374151', paddingVertical: 10, alignItems: 'center' },
  cell: { color: '#e5e7eb', paddingHorizontal: 3, fontSize: 13 },
  headerCell: { color: '#9ca3af', fontWeight: '800', fontSize: 12 },
  rankCell: { width: 28, textAlign: 'center' },
  nameCell: { flex: 1.35 },
  stringsCell: { flex: 1.35 },
  totalCell: { width: 46, textAlign: 'right' },
  timeCell: { width: 58, textAlign: 'right' },
  pointsCell: { width: 55, textAlign: 'right' },
  bold: { fontWeight: '800', color: '#fff' },
  reportActionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
  summaryReport: { backgroundColor: '#ffffff', borderRadius: 12, paddingVertical: 18, paddingHorizontal: 18, minWidth: 700 },
  summaryTitle: { color: '#111827', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  summarySubtitle: { color: '#374151', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 4, marginBottom: 14 },
  summaryHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#111827', paddingBottom: 8, marginBottom: 2 },
  summaryDataRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d1d5db', paddingVertical: 8 },
  summaryCell: { color: '#111827', fontSize: 14, paddingHorizontal: 6 },
  summaryHeaderText: { fontWeight: '900' },
  summaryRank: { width: 70, textAlign: 'center' },
  summaryShooter: { width: 280 },
  summaryTotal: { width: 170, textAlign: 'right' },
  summarySeries: { width: 150, textAlign: 'right' },
  footer: { color: '#6b7280', textAlign: 'center', marginTop: 4 },
});
