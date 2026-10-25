# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

-keepclassmembers class com.desktop.schedule.WidgetBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.desktop.schedule.BootBridge { *; }
-keepclassmembers class com.desktop.schedule.BootBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.desktop.schedule.widget.ScheduleWidgetProvider { *; }
-keep class com.desktop.schedule.widget.ScheduleWidgetConfigureActivity { *; }

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile