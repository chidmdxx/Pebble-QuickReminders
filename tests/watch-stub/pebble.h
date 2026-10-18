#ifndef TEST_PEBBLE_H
#define TEST_PEBBLE_H
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MESSAGE_KEY_COMMAND 10000
#define MESSAGE_KEY_TEXT 10001
#define MESSAGE_KEY_TOKEN 10002
#define MESSAGE_KEY_TITLE 10003
#define MESSAGE_KEY_WHEN 10004
#define MESSAGE_KEY_STATUS 10005
#define MESSAGE_KEY_CAN_CONFIRM 10006
#define MESSAGE_KEY_ERROR 10007
#define MESSAGE_KEY_SECONDS_UNTIL 10008
#define MESSAGE_KEY_REQUEST_ID 10009
#define MESSAGE_KEY_RIBBON_COLOR 10010
#define MESSAGE_KEY_AUTO_CLOSE 10011
#ifdef PBL_COLOR
#define PBL_IF_COLOR_ELSE(color, bw) (color)
#else
#define PBL_IF_COLOR_ELSE(color, bw) (bw)
#endif
#ifdef PBL_ROUND
#define PBL_IF_ROUND_ELSE(round, rect) (round)
#else
#define PBL_IF_ROUND_ELSE(round, rect) (rect)
#endif
#define FONT_KEY_GOTHIC_24 "24"
#define FONT_KEY_GOTHIC_24_BOLD "24-bold"
#define GTextAlignmentCenter 0
#define BUTTON_ID_SELECT 2
#define BUTTON_ID_BACK 0
#define BUTTON_ID_UP 1
#define BUTTON_ID_DOWN 3
#define SECOND_UNIT 1
#define APP_LOG_LEVEL_INFO 0
#define APP_LOG_LEVEL_WARNING 1
#define APP_LOG(...) fake_app_log(__VA_ARGS__)

typedef struct { int16_t x, y; } GPoint;
typedef struct { int16_t w, h; } GSize;
typedef struct { GPoint origin; GSize size; } GRect;
#define GPoint(x, y) ((GPoint){x, y})
#define GSize(w, h) ((GSize){w, h})
#define GRect(x, y, w, h) ((GRect){{x, y}, {w, h}})
typedef struct Layer { GRect bounds; struct Layer *parent; } Layer;
typedef struct Window Window;
typedef struct { void (*load)(Window *); void (*unload)(Window *); } WindowHandlers;
struct Window { Layer root; WindowHandlers handlers; bool loaded; void *click_owner; };
typedef uint8_t GColor;
typedef struct { uint8_t data[32]; GColor *palette; bool palette_owned; } GBitmap;
#define GBitmapFormat1Bit 0
#define GBitmapFormat1BitPalette 1
#define GColorClear 0x00
#define GColorWhite 0xff
#define GColorBlack 0xc0
#define GColorDarkCandyAppleRed 0xe0
#define GColorFromRGB(r, g, b) ((GColor)(0xc0 | (((r) >> 6) << 4) | (((g) >> 6) << 2) | ((b) >> 6)))
#define ActionBarLayerIconPressAnimationNone 0
typedef struct {
  Window *window;
  void (*provider)(void *);
  const GBitmap *icons[4];
  bool static_icons[4];
  uint8_t background_color;
} ActionBarLayer;
typedef int TimeUnits;
typedef struct {
  Layer layer;
  const char *text;
  const char *font;
  bool screen_flow, flow_hierarchy_ready;
  uint8_t flow_inset;
} TextLayer;
typedef struct ScrollLayer ScrollLayer;
typedef struct {
  void (*content_offset_changed_handler)(ScrollLayer *, void *);
  void (*click_config_provider)(void *);
} ScrollLayerCallbacks;
struct ScrollLayer { Layer layer; GPoint offset; GSize size; ScrollLayerCallbacks callbacks; bool paging; };
typedef void *ClickRecognizerRef;
typedef struct { bool confirmation, error_dialogs; } DictationSession;
typedef int DictationSessionStatus;
enum {
  DictationSessionStatusSuccess,
  DictationSessionStatusFailureTranscriptionRejected,
  DictationSessionStatusFailureTranscriptionRejectedWithError,
  DictationSessionStatusFailureSystemAborted,
  DictationSessionStatusFailureNoSpeechDetected,
  DictationSessionStatusFailureConnectivityError,
  DictationSessionStatusFailureDisabled,
  DictationSessionStatusFailureInternalError,
  DictationSessionStatusFailureRecognizerError
};
typedef struct { void (*callback)(void *); void *context; bool active; int ms; } AppTimer;
typedef int AppMessageResult;
enum { APP_MSG_OK, TUPLE_CSTRING, TUPLE_INT, TUPLE_UINT };
typedef union {
  int8_t int8; uint8_t uint8; int16_t int16; uint16_t uint16;
  int32_t int32; uint32_t uint32; char cstring[256];
} TupleValue;
typedef struct { uint32_t key; uint8_t type; uint16_t length; TupleValue *value; } Tuple;
typedef struct { Tuple *tuples; size_t count; } DictionaryIterator;

static Window *fake_stack[12];
static int fake_depth, fake_dictation_starts, fake_sends, fake_text_height = 100;
static int fake_title_height = 24;
static char fake_command[20];
static DictionaryIterator fake_outbox;
static time_t fake_now = 100000;
static time_t fake_time(time_t *result) { if (result) *result = fake_now; return fake_now; }
#define time fake_time
static void (*fake_tick)(struct tm *, TimeUnits);
static void (*fake_clicks[4])(ClickRecognizerRef, void *);
static void (*fake_long_clicks[4])(ClickRecognizerRef, void *);
static void (*fake_long_release[4])(ClickRecognizerRef, void *);
static void (*fake_raw_down[4])(ClickRecognizerRef, void *);
static AppTimer fake_timers[512];
static int fake_timer_count;
static int fake_outbox_result, fake_begin_result;
static int fake_dictation_stops;
static int32_t fake_settings = -1;
static bool persist_exists(uint32_t key) { (void)key; return fake_settings >= 0; }
static int32_t persist_read_int(uint32_t key) { (void)key; return fake_settings; }
static int persist_write_int(uint32_t key, int32_t value) { (void)key; fake_settings = value; return 4; }

static void fake_app_log(int level, const char *format, ...) { (void)level; (void)format; }
static GRect layer_get_bounds(Layer *p) { return p->bounds; }
static void layer_set_frame(Layer *p, GRect frame) { p->bounds = frame; }
static void layer_add_child(Layer *p, Layer *c) { c->parent = p; }
static Window *window_create(void) {
  Window *w = calloc(1, sizeof(*w));
  w->root.bounds = GRect(0, 0, PBL_DISPLAY_WIDTH, PBL_DISPLAY_HEIGHT);
  return w;
}
static Layer *window_get_root_layer(Window *w) { return &w->root; }
static Window *window_stack_get_top_window(void) { return fake_depth ? fake_stack[fake_depth - 1] : NULL; }
static void window_set_window_handlers(Window *w, WindowHandlers h) { w->handlers = h; }
static void window_stack_push(Window *w, bool animated) {
  fake_stack[fake_depth++] = w;
  if (!w->loaded) { w->loaded = true; if (w->handlers.load) w->handlers.load(w); }
}
static Window *window_stack_pop(bool animated) {
  Window *w = fake_stack[--fake_depth];
  if (w->loaded && w->handlers.unload) w->handlers.unload(w);
  w->loaded = false;
  return w;
}
static void window_stack_pop_all(bool animated) { while (fake_depth) window_stack_pop(animated); }
static void window_destroy(Window *w) {
  if (w->loaded && w->handlers.unload) w->handlers.unload(w);
  free(w);
}
static ScrollLayer *scroll_layer_create(GRect b) { ScrollLayer *s = calloc(1, sizeof(*s)); s->layer.bounds = b; return s; }
static void scroll_layer_destroy(ScrollLayer *s) { free(s); }
static Layer *scroll_layer_get_layer(ScrollLayer *s) { return &s->layer; }
static GPoint scroll_layer_get_content_offset(ScrollLayer *s) { return s->offset; }
static GSize scroll_layer_get_content_size(ScrollLayer *s) { return s->size; }
static void scroll_layer_set_content_offset(ScrollLayer *s, GPoint p, bool a) {
  s->offset = p;
  if (s->callbacks.content_offset_changed_handler) s->callbacks.content_offset_changed_handler(s, NULL);
}
static void scroll_layer_set_content_size(ScrollLayer *s, GSize v) { s->size = v; }
static void scroll_layer_set_paging(ScrollLayer *s, bool enabled) { s->paging = enabled; }
static void scroll_layer_set_callbacks(ScrollLayer *s, ScrollLayerCallbacks c) { s->callbacks = c; }
static void scroll_layer_set_click_config_onto_window(ScrollLayer *s, Window *w) {
  w->click_owner = s;
  if (s->callbacks.click_config_provider) s->callbacks.click_config_provider(s);
}
static void scroll_layer_scroll_up_click_handler(ClickRecognizerRef r, void *context) {
  ScrollLayer *s = context;
  int y = s->offset.y + (s->paging ? s->layer.bounds.size.h : 40);
  scroll_layer_set_content_offset(s, GPoint(0, y > 0 ? 0 : y), true);
}
static void scroll_layer_scroll_down_click_handler(ClickRecognizerRef r, void *context) {
  ScrollLayer *s = context;
  int bottom = s->layer.bounds.size.h - s->size.h;
  if (bottom > 0) bottom = 0;
  int y = s->offset.y - (s->paging ? s->layer.bounds.size.h : 40);
  scroll_layer_set_content_offset(s, GPoint(0, y < bottom ? bottom : y), true);
}
static void scroll_layer_add_child(ScrollLayer *s, Layer *l) { l->parent = &s->layer; }
static TextLayer *text_layer_create(GRect b) { TextLayer *t = calloc(1, sizeof(*t)); t->layer.bounds = b; return t; }
static void text_layer_destroy(TextLayer *t) { free(t); }
static Layer *text_layer_get_layer(TextLayer *t) { return &t->layer; }
static void text_layer_set_size(TextLayer *t, GSize s) { t->layer.bounds.size = s; }
static void text_layer_set_text(TextLayer *t, const char *s) { t->text = s; }
static GSize text_layer_get_content_size(TextLayer *t) {
  int height = t->font && !strcmp(t->font, FONT_KEY_GOTHIC_24_BOLD) ? fake_title_height : fake_text_height;
  return GSize(t->layer.bounds.size.w, height);
}
static void text_layer_set_font(TextLayer *t, const char *f) { t->font = f; }
static void text_layer_set_text_alignment(TextLayer *t, int a) { (void)t; (void)a; }
static void text_layer_enable_screen_text_flow_and_paging(TextLayer *t, uint8_t inset) {
  t->screen_flow = true;
  t->flow_inset = inset;
  t->flow_hierarchy_ready = t->layer.parent && t->layer.parent->parent;
}
static const char *fonts_get_system_font(const char *s) { return s; }
static void window_single_click_subscribe(int b, void (*f)(ClickRecognizerRef, void *)) { fake_clicks[b] = f; }
static void window_single_repeating_click_subscribe(int b, int ms, void (*f)(ClickRecognizerRef, void *)) { fake_clicks[b] = f; (void)ms; }
static void window_long_click_subscribe(int b, int ms, void (*f)(ClickRecognizerRef, void *), void (*r)(ClickRecognizerRef, void *)) {
  (void)ms; fake_long_clicks[b] = f; fake_long_release[b] = r;
}
static void window_raw_click_subscribe(int b, void (*d)(ClickRecognizerRef, void *), void (*u)(ClickRecognizerRef, void *), void *c) {
  (void)u; (void)c; fake_raw_down[b] = d;
}
static DictationSession *dictation_session_create(int n, void (*f)(DictationSession *, DictationSessionStatus, char *, void *), void *c) {
  (void)n; (void)f; (void)c; return calloc(1, sizeof(DictationSession));
}
static void dictation_session_destroy(DictationSession *s) { free(s); }
static void dictation_session_enable_confirmation(DictationSession *s, bool b) { s->confirmation = b; }
static void dictation_session_enable_error_dialogs(DictationSession *s, bool b) { s->error_dialogs = b; }
static int dictation_session_start(DictationSession *s) { (void)s; fake_dictation_starts++; return DictationSessionStatusSuccess; }
static int dictation_session_stop(DictationSession *s) { (void)s; fake_dictation_stops++; return DictationSessionStatusSuccess; }
static AppTimer *app_timer_register(int ms, void (*f)(void *), void *c) {
  assert(fake_timer_count < 512);
  AppTimer *t = &fake_timers[fake_timer_count++];
  *t = (AppTimer){f, c, true, ms};
  return t;
}
static void app_timer_cancel(AppTimer *t) { t->active = false; }
static void fake_fire(AppTimer *t) {
  if (!t || !t->active) return;
  t->active = false;
  t->callback(t->context);
}
static AppMessageResult app_message_outbox_begin(DictionaryIterator **d) { *d = &fake_outbox; return fake_begin_result; }
static void dict_write_cstring(DictionaryIterator *d, uint32_t k, const char *s) {
  (void)d; if (k == MESSAGE_KEY_COMMAND) snprintf(fake_command, sizeof(fake_command), "%s", s);
}
static void dict_write_int32(DictionaryIterator *d, uint32_t k, int32_t v) { (void)d; (void)k; (void)v; }
static void dict_write_end(DictionaryIterator *d) { (void)d; }
static AppMessageResult app_message_outbox_send(void) { fake_sends++; return fake_outbox_result; }
static Tuple *dict_find(DictionaryIterator *d, uint32_t k) {
  for (size_t i = 0; i < d->count; i++) if (d->tuples[i].key == k) return &d->tuples[i];
  return NULL;
}
static void app_message_register_inbox_received(void (*f)(DictionaryIterator *, void *)) { (void)f; }
static void app_message_register_outbox_failed(void (*f)(DictionaryIterator *, AppMessageResult, void *)) { (void)f; }
static AppMessageResult app_message_open(int in, int out) { (void)in; (void)out; return APP_MSG_OK; }
static void app_event_loop(void) {}
static GBitmap *gbitmap_create_blank(GSize size, int format) { (void)size; (void)format; return calloc(1, sizeof(GBitmap)); }
static GBitmap *gbitmap_create_blank_with_palette(GSize size, int format, GColor *palette, bool free_on_destroy) {
  GBitmap *bitmap = gbitmap_create_blank(size, format);
  bitmap->palette = palette;
  bitmap->palette_owned = free_on_destroy;
  return bitmap;
}
static uint8_t *gbitmap_get_data(GBitmap *b) { return b->data; }
static int gbitmap_get_bytes_per_row(GBitmap *b) { (void)b; return 2; }
static void gbitmap_destroy(GBitmap *b) { if (b->palette_owned) free(b->palette); free(b); }
static ActionBarLayer *action_bar_layer_create(void) { return calloc(1, sizeof(ActionBarLayer)); }
static void action_bar_layer_destroy(ActionBarLayer *b) { free(b); }
static void action_bar_layer_add_to_window(ActionBarLayer *b, Window *w) { b->window = w; w->click_owner = b; }
static void action_bar_layer_remove_from_window(ActionBarLayer *b) {
  if (b->window) b->window->click_owner = NULL;
  b->window = NULL;
}
static void action_bar_layer_set_click_config_provider(ActionBarLayer *b, void (*f)(void *)) { b->provider = f; if (f) f(b); }
static void action_bar_layer_set_icon(ActionBarLayer *b, int button, const GBitmap *icon) {
  b->icons[button] = icon;
  if (b->provider) b->provider(b);
}
static void action_bar_layer_set_background_color(ActionBarLayer *b, uint8_t color) {
  b->background_color = color;
}
static void action_bar_layer_set_icon_press_animation(ActionBarLayer *b, int button, int animation) {
  b->static_icons[button] = animation == ActionBarLayerIconPressAnimationNone;
}
static void tick_timer_service_subscribe(TimeUnits units, void (*f)(struct tm *, TimeUnits)) { (void)units; fake_tick = f; }
static void tick_timer_service_unsubscribe(void) { fake_tick = NULL; }
#endif
