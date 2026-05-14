import "./global.css";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Text, View, ScrollView, ActivityIndicator } from "react-native";
import { BusService, DiningService, DEFAULT_DINING_LOCATIONS } from "@rutgers-gpt/shared";

export default function App() {
  const [eta, setEta] = useState<string>("…");
  const [meal, setMeal] = useState<string>("…");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [etas, parsed] = await Promise.all([
          BusService.getStopEtas({ stopId: "10035" }),
          DiningService.loadParsedMenu(DEFAULT_DINING_LOCATIONS[0]),
        ]);
        const next = BusService.pickSoonest(etas);
        const sum = DiningService.summarizeNextMeal(parsed);
        if (!cancelled) {
          setEta(next ? `${next.etaDisplay} (${next.routeShortName || next.routeName})` : "No ETAs");
          setMeal(sum.detail);
        }
      } catch (e) {
        if (!cancelled) setEta((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View className="flex-1 bg-slate-950 pt-14">
      <StatusBar style="light" />
      <ScrollView className="px-4">
        <Text className="text-2xl font-bold text-white">Rutgers IQ</Text>
        <Text className="mt-1 text-slate-400">Expo + NativeWind · shared services</Text>
        {loading ? (
          <ActivityIndicator className="mt-6" color="#f472b6" />
        ) : (
          <View className="mt-6 gap-4">
            <View className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <Text className="text-xs uppercase text-slate-500">Next bus</Text>
              <Text className="mt-2 text-lg text-white">{eta}</Text>
            </View>
            <View className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <Text className="text-xs uppercase text-slate-500">Atrium menu sample</Text>
              <Text className="mt-2 text-sm leading-relaxed text-slate-300">{meal}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
