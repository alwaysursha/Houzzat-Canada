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
    absoluteFillObject: {
      position: "absolute";
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
    };
  };

  export const NativeModules: {
    [key: string]: any;
    HouzzatProFcm?: {
      ensureProAlertsChannel(): Promise<boolean>;
      getToken(): Promise<string>;
      getInitialNotification(): Promise<{ href?: string; type?: string } | null>;
      addListener(eventName: string): void;
      removeListeners(count: number): void;
    };
  };

  export class NativeEventEmitter {
    constructor(_nativeModule?: any) {}
    addListener(
      _eventType: string,
      listener: (event: any) => void,
    ): { remove(): void } {
      return { remove() {} };
    }
    removeAllListeners(_eventType?: string): void {}
  }

  export const Platform: {
    OS: "ios" | "android" | "windows" | "macos" | "web";
    Version: number | string;
    select<T>(specifics: { [platform in "ios" | "android" | "default"]?: T }): T;
  };

  export const PermissionsAndroid: {
    PERMISSIONS: {
      POST_NOTIFICATIONS: string;
      [key: string]: string;
    };
    RESULTS: {
      GRANTED: string;
      DENIED: string;
      NEVER_ASK_AGAIN: string;
    };
    check(permission: string): Promise<boolean>;
    request(permission: string): Promise<string>;
  };

  export const Switch: React.FC<{
    value?: boolean;
    onValueChange?: (value: boolean) => void;
    disabled?: boolean;
    trackColor?: { false?: string; true?: string };
    thumbColor?: string;
    [key: string]: any;
  }>;

  export const AppRegistry: {
    registerComponent(appKey: string, componentProvider: () => React.ComponentType<any>): void;
  };

  export type AppStateStatus = "active" | "background" | "inactive" | "unknown" | "extension";

  export const AppState: {
    currentState: AppStateStatus;
    addEventListener(
      type: "change",
      listener: (state: AppStateStatus) => void,
    ): { remove: () => void };
  };

  export interface AlertButton {
    text?: string;
    onPress?: (value?: string) => void;
    style?: "default" | "cancel" | "destructive";
  }

  export const Alert: {
    alert(
      title: string,
      message?: string,
      buttons?: AlertButton[],
      options?: { cancelable?: boolean }
    ): void;
  };

  export const LayoutAnimation: {
    configureNext(config: any, onAnimationDidEnd?: () => void): void;
    create(duration: number, type?: any, creationProp?: any): any;
    Presets: {
      easeInEaseOut: any;
      linear: any;
      spring: any;
    };
  };

  export const UIManager: {
    setLayoutAnimationEnabledExperimental?: (enabled: boolean) => void;
    [key: string]: any;
  };

  export const StatusBar: React.FC<{
    barStyle?: "default" | "light-content" | "dark-content";
    backgroundColor?: string;
  }> & {
    currentHeight?: number;
  };

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

  export const Linking: {
    openURL(url: string): Promise<void>;
    canOpenURL(url: string): Promise<boolean>;
    openSettings(): Promise<void>;
  };

  export const Clipboard: {
    setString(text: string): void;
    getString(): Promise<string>;
  };

  export const Share: {
    share(options: { message?: string; url?: string; title?: string }): Promise<{ action: string }>;
  };

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

  export const Modal: React.FC<{
    visible?: boolean;
    transparent?: boolean;
    animationType?: "none" | "slide" | "fade";
    onRequestClose?: () => void;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const TouchableWithoutFeedback: React.FC<{
    onPress?: () => void;
    children?: React.ReactNode;
    [key: string]: any;
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
    extraData?: unknown;
    removeClippedSubviews?: boolean;
    initialNumToRender?: number;
    maxToRenderPerBatch?: number;
    windowSize?: number;
    keyboardShouldPersistTaps?: "always" | "never" | "handled" | boolean;
  }>;

  export const BackHandler: {
    addEventListener(
      eventName: "hardwareBackPress",
      handler: () => boolean | null | undefined,
    ): { remove: () => void };
    exitApp(): void;
  };

  export const ToastAndroid: {
    SHORT: number;
    LONG: number;
    show(message: string, duration: number): void;
  };
}
