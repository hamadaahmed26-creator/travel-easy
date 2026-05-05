import React, { useState } from "react";
import { Pressable, StyleSheet, View, ViewStyle, StyleProp, Platform } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSpring } from "react-native-reanimated";

/**
 * A pressable card that lifts on hover (web) and presses down on tap.
 * Uses Reanimated for smooth transforms.
 */
export default function HoverCard({
  onPress,
  style,
  children,
  testID,
  liftPx = 6,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
  liftPx?: number;
}) {
  const lift = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scale: scale.value }],
    shadowOpacity: glow.value,
  }));

  return (
    <Animated.View style={[styles.shadow, animStyle]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onHoverIn={() => {
          if (Platform.OS === "web") {
            lift.value = withSpring(-liftPx, { damping: 15, stiffness: 140 });
            glow.value = withTiming(0.55, { duration: 200 });
          }
        }}
        onHoverOut={() => {
          if (Platform.OS === "web") {
            lift.value = withSpring(0, { damping: 15, stiffness: 140 });
            glow.value = withTiming(0, { duration: 200 });
          }
        }}
        onPressIn={() => {
          scale.value = withTiming(0.98, { duration: 100 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 200 });
        }}
        style={({ pressed }) => [style, pressed && Platform.OS !== "web" && { opacity: 0.9 }]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#5B8FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    shadowOpacity: 0,
    elevation: 0,
  },
});
