declare module "react-native" {
  import * as React from "react";

  export interface StyleProp<T> {
    [key: string]: any;
  }

  export interface ViewStyle {
    [key: string]: any;
  }

  export interface TextStyle {
    [key: string]: any;
  }

  export const StyleSheet: {
    create<T extends Record<string, any>>(styles: T): T;
  };

  export const NativeModules: {
    [key: string]: any;
  };

  export const Platform: {
    OS: "ios" | "android" | "windows" | "macos" | "web";
    select<T>(specifics: { [platform in "ios" | "android" | "default"]?: T }): T;
  };

  export const AppRegistry: {
    registerComponent(appKey: string, componentProvider: () => React.ComponentType<any>): void;
  };

  export const StatusBar: React.FC<{
    barStyle?: "default" | "light-content" | "dark-content";
    backgroundColor?: string;
  }>;

  export const View: React.FC<{
    style?: any;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const Text: React.FC<{
    style?: any;
    children?: React.ReactNode;
    numberOfLines?: number;
    [key: string]: any;
  }>;

  export const TextInput: React.FC<{
    style?: any;
    value?: string;
    onChangeText?: (text: string) => void;
    placeholder?: string;
    placeholderTextColor?: string;
    secureTextEntry?: boolean;
    autoCapitalize?: "none" | "sentences" | "words" | "characters";
    keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
    [key: string]: any;
  }>;

  export const TouchableOpacity: React.FC<{
    style?: any;
    activeOpacity?: number;
    onPress?: () => void;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const ActivityIndicator: React.FC<{
    size?: "small" | "large" | number;
    color?: string;
    style?: any;
  }>;

  export const KeyboardAvoidingView: React.FC<{
    style?: any;
    behavior?: "height" | "position" | "padding";
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const FlatList: <ItemT>(props: {
    data: ReadonlyArray<ItemT> | null | undefined;
    renderItem: (info: { item: ItemT; index: number }) => React.ReactElement | null;
    keyExtractor?: (item: ItemT, index: number) => string;
    contentContainerStyle?: any;
    showsVerticalScrollIndicator?: boolean;
    style?: any;
    ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
    [key: string]: any;
  }) => React.ReactElement;
}
