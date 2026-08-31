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

  export const Image: React.FC<{
    source: { uri?: string } | number;
    style?: any;
    resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
    [key: string]: any;
  }>;

  export const SafeAreaView: React.FC<{
    style?: any;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const ScrollView: React.FC<{
    style?: any;
    contentContainerStyle?: any;
    children?: React.ReactNode;
    showsVerticalScrollIndicator?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    refreshControl?: React.ReactElement;
    [key: string]: any;
  }>;

  export const RefreshControl: React.FC<{
    refreshing: boolean;
    onRefresh: () => void;
    colors?: string[];
    tintColor?: string;
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
    editable?: boolean;
    [key: string]: any;
  }>;

  export const TouchableOpacity: React.FC<{
    style?: any;
    children?: React.ReactNode;
    onPress?: () => void;
    activeOpacity?: number;
    disabled?: boolean;
    [key: string]: any;
  }>;

  export const ActivityIndicator: React.FC<{
    size?: "small" | "large" | number;
    color?: string;
  }>;

  export const KeyboardAvoidingView: React.FC<{
    style?: any;
    behavior?: "height" | "position" | "padding";
    children?: React.ReactNode;
  }>;

  export const FlatList: React.FC<{
    data: any[];
    keyExtractor: (item: any, index: number) => string;
    renderItem: (info: { item: any; index: number }) => React.ReactElement | null;
    style?: any;
    contentContainerStyle?: any;
    showsVerticalScrollIndicator?: boolean;
    refreshing?: boolean;
    onRefresh?: () => void;
    refreshControl?: React.ReactElement;
    ListEmptyComponent?: React.ReactElement | null;
    ListHeaderComponent?: React.ReactElement | null;
    ListFooterComponent?: React.ReactElement | null;
  }>;
}
