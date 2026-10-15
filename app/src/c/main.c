#include <pebble.h>

#define TITLE_SIZE 161
#define WHEN_SIZE 80
#define REVIEW_INSET 6

static Window *s_review_window;
static ScrollLayer *s_scroll;
static TextLayer *s_review_title, *s_review_text;
static ActionBarLayer *s_action_bar;
enum { ICON_CONFIRM, ICON_VOICE, ICON_RELOAD, ICON_COUNT };
static GBitmap *s_icons[ICON_COUNT];
static int s_action_icon = -1;
static DictationSession *s_dictation;
static AppTimer *s_timeout, *s_feedback;
static char s_title[TITLE_SIZE], s_when[WHEN_SIZE], s_notice[180], s_review[1400];
static char s_transcript[513], s_last_command[12];
static int32_t s_token;
static int32_t s_seconds_until;
static time_t s_delta_received_at;
static char s_delta[40];
static bool s_draft, s_pending, s_reviewed, s_busy, s_can_confirm;
static bool s_reviewing_reminder;
static bool s_dictating, s_reload_required, s_show_transcript, s_transcript_pending;
static bool s_alive, s_select_held, s_wait_visible, s_cancel_to_record;
static bool s_capture_failed;
static int32_t s_request;

static void render_review(void);
static void show_review(void);
static void show_notice(void);
static void dictate(void);
static void send_command(const char *command, const char *text);

static int32_t seconds_remaining(void) {
  time_t elapsed = time(NULL) - s_delta_received_at;
  if (elapsed < 0) elapsed = 0;
  return elapsed >= s_seconds_until ? 0 : s_seconds_until - (int32_t)elapsed;
}

static void format_delta(char *text, size_t size, int32_t seconds) {
  int minutes = seconds / 60 + (seconds % 60 != 0);
  int days = minutes / 1440;
  int hours = minutes % 1440 / 60;
  minutes %= 60;
  if (seconds <= 0) snprintf(text, size, "Due now / past");
  else if (seconds < 60) snprintf(text, size, "In <1 min");
  else if (days && (hours || minutes)) snprintf(text, size, "In %dd %dh %dm", days, hours, minutes);
  else if (days) snprintf(text, size, "In %dd", days);
  else if (hours && minutes) snprintf(text, size, "In %dh %dm", hours, minutes);
  else if (hours) snprintf(text, size, "In %dh", hours);
  else snprintf(text, size, "In %d min", minutes);
}

static void refresh(void) {
  if (s_review_text) render_review();
}

static void tick(struct tm *tick_time, TimeUnits units) {
  (void)tick_time; (void)units;
  if (!s_draft && !s_pending) return;
  char delta[sizeof(s_delta)];
  format_delta(delta, sizeof(delta), seconds_remaining());
  bool expired = s_draft && s_can_confirm && !seconds_remaining();
  if (expired) s_can_confirm = false;
  if (!s_review_text || !s_reviewing_reminder) {
    return;
  }
  if (expired || strcmp(delta, s_delta) != 0) {
    bool reviewed = s_reviewed;
    refresh();
    // A countdown reflow is not a new user scroll/review gesture.
    s_reviewed = reviewed;
  }
}

static void stop_timeout(void) {
  if (s_timeout) {
    app_timer_cancel(s_timeout);
    s_timeout = NULL;
  }
  if (s_feedback) {
    app_timer_cancel(s_feedback);
    s_feedback = NULL;
  }
  s_wait_visible = false;
}

static void exit_app(void) {
  s_alive = false;
  s_busy = false;
  s_transcript_pending = false;
  stop_timeout();
  window_stack_pop_all(false);
}

static void feedback(void *context) {
  if (!s_alive || !s_busy || (int32_t)(intptr_t)context != s_request) return;
  s_feedback = NULL;
  s_wait_visible = true;
  if (!s_dictating) refresh();
}

static void timeout(void *context) {
  if (!s_alive || !s_busy || (int32_t)(intptr_t)context != s_request) return;
  s_timeout = NULL;
  stop_timeout();
  s_busy = false;
  s_reload_required = true;
  snprintf(s_notice, sizeof(s_notice), "No phone response. Reload saved state.");
  if (!s_dictating) show_notice();
}

static void send_command(const char *command, const char *text) {
  if (!s_alive || s_busy) return;
  if (s_reload_required && strcmp(command, "ready") != 0) {
    show_notice();
    return;
  }
  DictionaryIterator *iterator;
  AppMessageResult result = app_message_outbox_begin(&iterator);
  if (result != APP_MSG_OK || !iterator) {
    snprintf(s_notice, sizeof(s_notice), "Phone not ready. Try again.");
    s_reload_required = true;
    show_notice();
    return;
  }
  dict_write_cstring(iterator, MESSAGE_KEY_COMMAND, command);
  dict_write_int32(iterator, MESSAGE_KEY_TOKEN, s_token);
  s_request++;
  dict_write_int32(iterator, MESSAGE_KEY_REQUEST_ID, s_request);
  if (text) dict_write_cstring(iterator, MESSAGE_KEY_TEXT, text);
  dict_write_end(iterator);
  if (app_message_outbox_send() != APP_MSG_OK) {
    snprintf(s_notice, sizeof(s_notice), "Could not send. Reopen to check.");
    s_reload_required = true;
    show_notice();
    return;
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "Command sent: %s", command);
  snprintf(s_last_command, sizeof(s_last_command), "%s", command);
  s_busy = true;
  stop_timeout();
  s_timeout = app_timer_register(12000, timeout, (void *)(intptr_t)s_request);
  s_feedback = app_timer_register(800, feedback, (void *)(intptr_t)s_request);
}

static void review_unload(Window *window) {
  (void)window;
  if (s_action_bar) {
    action_bar_layer_remove_from_window(s_action_bar);
    action_bar_layer_destroy(s_action_bar);
    s_action_bar = NULL;
  }
  for (int i = 0; i < ICON_COUNT; i++) {
    if (s_icons[i]) gbitmap_destroy(s_icons[i]);
    s_icons[i] = NULL;
  }
  s_action_icon = -1;
  text_layer_destroy(s_review_title);
  text_layer_destroy(s_review_text);
  scroll_layer_destroy(s_scroll);
  s_review_title = NULL;
  s_review_text = NULL;
  s_scroll = NULL;
}

static void review_scrolled(ScrollLayer *scroll, void *context) {
  (void)context;
  if (!s_busy && s_reviewing_reminder &&
      -scroll_layer_get_content_offset(scroll).y +
        layer_get_bounds(scroll_layer_get_layer(scroll)).size.h >=
        scroll_layer_get_content_size(scroll).h) {
    s_reviewed = true;
  }
}

static void review_select(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  if (!s_alive || s_select_held || s_busy || s_dictating ||
      window_stack_get_top_window() != s_review_window) return;
  if (s_reload_required) {
    send_command("ready", NULL);
  } else if (!s_reviewing_reminder) {
    dictate();
  } else if (s_draft) {
    if (!s_can_confirm || !seconds_remaining()) {
      s_can_confirm = false;
      snprintf(s_notice, sizeof(s_notice), "Time passed. Back: record again.");
      refresh();
    } else if (!s_reviewed) {
      snprintf(s_notice, sizeof(s_notice), "Read to the bottom with Down before confirming.");
      refresh();
    } else send_command("confirm", NULL);
  } else if (s_pending) {
    if (s_reviewed) send_command("retry", NULL);
    else {
      snprintf(s_notice, sizeof(s_notice), "Read to the bottom before retrying.");
      refresh();
    }
  }
}

static void select_down(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  s_select_held = false;
}

static void review_hold(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  s_select_held = true;
}

static void review_back(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  if (!s_alive) return;
  if (s_dictating) {
    DictationSessionStatus status = dictation_session_stop(s_dictation);
    APP_LOG(APP_LOG_LEVEL_INFO, "Recording Back stop status: %d", (int)status);
    s_dictating = false;
    exit_app();
    return;
  }
  if (s_busy) return;
  s_select_held = true;
  if (s_reload_required) { exit_app(); return; }
  if (s_draft) {
    s_cancel_to_record = true;
    s_reviewed = false;
    send_command("cancel", NULL);
  } else {
    // A requested insertion is never canceled or deleted by navigation.
    dictate();
  }
}

static void review_up(ClickRecognizerRef recognizer, void *context) {
  (void)context;
  if (s_scroll && window_stack_get_top_window() == s_review_window)
    scroll_layer_scroll_up_click_handler(recognizer, s_scroll);
}

static void review_down(ClickRecognizerRef recognizer, void *context) {
  (void)context;
  if (s_scroll && window_stack_get_top_window() == s_review_window)
    scroll_layer_scroll_down_click_handler(recognizer, s_scroll);
}

static void review_clicks(void *context) {
  (void)context;
  window_single_repeating_click_subscribe(BUTTON_ID_UP, 100, review_up);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, 100, review_down);
  window_single_click_subscribe(BUTTON_ID_SELECT, review_select);
  window_raw_click_subscribe(BUTTON_ID_SELECT, select_down, NULL, NULL);
  window_long_click_subscribe(BUTTON_ID_SELECT, 700, review_hold, NULL);
  window_single_click_subscribe(BUTTON_ID_BACK, review_back);
}

static void render_review(void) {
  bool separate_title = s_reviewing_reminder && s_title[0] && !s_notice[0];
  if (s_action_bar) {
    action_bar_layer_set_click_config_provider(s_action_bar, review_clicks);
    int icon = s_reload_required ? ICON_RELOAD :
      (s_reviewing_reminder ? (s_draft ? ICON_CONFIRM : ICON_RELOAD) : ICON_VOICE);
    if (s_action_icon != icon) {
      action_bar_layer_set_icon(s_action_bar, BUTTON_ID_SELECT, s_icons[icon]);
      s_action_icon = icon;
    }
  }
  if (s_reviewing_reminder) {
    format_delta(s_delta, sizeof(s_delta), seconds_remaining());
    snprintf(s_review, sizeof(s_review), "%s%s%s%s%s\n%s%s%s",
             s_notice, s_notice[0] ? "\n\n" : "", separate_title ? "" : s_title,
             separate_title ? "" : "\n", s_when,
             s_delta, s_pending ?
             "\nInsertion requested. Check Timeline; delivery NOT verified. Do not retry a removed pin." : "",
             s_wait_visible ? "\nWaiting for phone..." : (s_pending ?
             "\nSelect: retry same pin\nBack: record again" : ""));
  } else {
    snprintf(s_review, sizeof(s_review), "%s%s%s%s%s", s_notice,
             s_show_transcript ? "\n\nHeard:\n" : "", s_show_transcript ? s_transcript : "",
             s_wait_visible ? "\nWaiting for phone..." : "",
             s_busy ? "" : (s_reload_required ?
             "\n\nSelect: reload saved state\nBack: exit" : "\n\nSelect: record again\nBack: record again"));
  }
  GSize bounds = layer_get_bounds(scroll_layer_get_layer(s_scroll)).size;
  text_layer_set_text(s_review_title, separate_title ? s_title : "");
  int title_height = 0;
  if (separate_title) {
    text_layer_set_size(s_review_title, GSize(bounds.w, 2400));
    text_layer_enable_screen_text_flow_and_paging(s_review_title, REVIEW_INSET);
    title_height = text_layer_get_content_size(s_review_title).h;
  }
  text_layer_set_size(s_review_title, GSize(bounds.w, title_height));
  int details_y = separate_title ? title_height + REVIEW_INSET : 0;
  layer_set_frame(text_layer_get_layer(s_review_text), GRect(0, details_y, bounds.w, 2400));
  text_layer_enable_screen_text_flow_and_paging(s_review_text, REVIEW_INSET);
  text_layer_set_text(s_review_text, s_review);
  GSize size = text_layer_get_content_size(s_review_text);
  // Keep the final circular page aligned instead of clamping its last line to the rim.
  int height = ((details_y + size.h + 4 + bounds.h - 1) / bounds.h) * bounds.h;
  text_layer_set_size(s_review_text, GSize(bounds.w, height - details_y));
  scroll_layer_set_content_size(s_scroll, GSize(bounds.w, height));
  review_scrolled(s_scroll, NULL);
}

static GBitmap *create_icon(int icon) {
  static GColor palette[] = {GColorClear, GColorWhite};
  static const uint16_t pixels[ICON_COUNT][16] = {
    {0, 0, 0, 0, 0x2000, 0x3000, 0x1800, 0x0c00, 0x0618, 0x0330, 0x01e0, 0x00c0},
    {0, 0, 0x0180, 0x03c0, 0x03c0, 0x03c0, 0x03c0, 0x03c0, 0x0990, 0x0810, 0x0420, 0x03c0, 0x0180, 0x07e0},
    {0, 0, 0x0fc0, 0x1fe0, 0x3070, 0x2038, 0x003c, 0x003e, 0, 0x2000, 0x3000, 0x180c, 0x0ff8, 0x07f0}
  };
  GBitmap *bitmap = gbitmap_create_blank_with_palette(
    GSize(16, 16), GBitmapFormat1BitPalette, palette, false);
  if (!bitmap) return NULL;
  uint8_t *data = gbitmap_get_data(bitmap);
  int stride = gbitmap_get_bytes_per_row(bitmap);
  memset(data, 0, stride * 16);
  for (int y = 0; y < 16; y++) {
    for (int x = 0; x < 16; x++) {
      if (pixels[icon][y] & (1 << x)) data[y * stride + x / 8] |= 1 << (7 - x % 8);
    }
  }
  return bitmap;
}

static void review_load(Window *window) {
  Layer *layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(layer);
  int width = bounds.size.w - ACTION_BAR_WIDTH - REVIEW_INSET;
  s_scroll = scroll_layer_create(GRect(0, 0, width, bounds.size.h));
  scroll_layer_set_paging(s_scroll, true);
  scroll_layer_set_callbacks(s_scroll, (ScrollLayerCallbacks){
    .content_offset_changed_handler = review_scrolled
  });
  s_review_title = text_layer_create(GRect(0, 0, width, 2400));
  text_layer_set_font(s_review_title, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text_alignment(s_review_title, GTextAlignmentCenter);
  scroll_layer_add_child(s_scroll, text_layer_get_layer(s_review_title));
  s_review_text = text_layer_create(GRect(0, 0, width, 2400));
  text_layer_set_font(s_review_text, fonts_get_system_font(FONT_KEY_GOTHIC_24));
  text_layer_set_text_alignment(s_review_text, GTextAlignmentCenter);
  scroll_layer_add_child(s_scroll, text_layer_get_layer(s_review_text));
  layer_add_child(layer, scroll_layer_get_layer(s_scroll));
  text_layer_enable_screen_text_flow_and_paging(s_review_text, REVIEW_INSET);
  s_action_bar = action_bar_layer_create();
  bool icons_ready = true;
  for (int i = 0; i < ICON_COUNT; i++) {
    s_icons[i] = create_icon(i);
    if (!s_icons[i]) icons_ready = false;
  }
  if (s_action_bar && icons_ready) {
    action_bar_layer_add_to_window(s_action_bar, window);
    action_bar_layer_set_background_color(s_action_bar, GColorDarkCandyAppleRed);
    action_bar_layer_set_icon_press_animation(s_action_bar, BUTTON_ID_SELECT, ActionBarLayerIconPressAnimationNone);
    action_bar_layer_set_click_config_provider(s_action_bar, review_clicks);
  } else {
    snprintf(s_notice, sizeof(s_notice), "Action bar unavailable. Restart the app.");
    s_reload_required = true;
    scroll_layer_set_callbacks(s_scroll, (ScrollLayerCallbacks){
      .content_offset_changed_handler = review_scrolled, .click_config_provider = review_clicks
    });
    scroll_layer_set_click_config_onto_window(s_scroll, window);
  }
  render_review();
}

static void show_review(void) {
  if (!s_alive) return;
  s_reviewing_reminder = true;
  if (s_scroll) scroll_layer_set_content_offset(s_scroll, GPoint(0, 0), false);
  refresh();
  s_reviewed = false;
  if (s_scroll) review_scrolled(s_scroll, NULL);
}

static void show_notice(void) {
  if (!s_alive) return;
  s_reviewing_reminder = false;
  if (s_scroll) scroll_layer_set_content_offset(s_scroll, GPoint(0, 0), false);
  refresh();
}

static void dictation_result(DictationSession *session, DictationSessionStatus status,
                             char *transcription, void *context) {
  (void)session;
  (void)context;
  if (!s_alive || !s_dictating) return;
  APP_LOG(APP_LOG_LEVEL_INFO, "Dictation status: %d", (int)status);
  s_dictating = false;
  if (status == DictationSessionStatusSuccess && transcription) {
    if (strlen(transcription) > 512) {
      s_capture_failed = true;
      snprintf(s_notice, sizeof(s_notice), "Too long. Dictate a shorter reminder.");
    } else {
      if (!s_reload_required) s_notice[0] = '\0';
      s_reviewed = false;
      snprintf(s_transcript, sizeof(s_transcript), "%s", transcription);
      s_transcript_pending = true;
      s_reviewing_reminder = false;
      if (!s_busy && !s_reload_required) {
        s_transcript_pending = false;
        send_command("parse", s_transcript);
      } else if (s_reload_required) show_notice();
      return;
    }
  } else if (status == DictationSessionStatusFailureTranscriptionRejected) {
    exit_app();
    return;
  } else {
    s_capture_failed = true;
    snprintf(s_notice, sizeof(s_notice), "Dictation failed (%d). Check phone speech settings.", (int)status);
  }
  show_notice();
}

static void dictate(void) {
  if (!s_alive || s_dictating) return;
  if (s_reload_required) { show_notice(); return; }
  s_show_transcript = false;
  s_capture_failed = false;
  s_select_held = true;
  s_notice[0] = '\0';
  s_reviewing_reminder = false;
  s_reviewed = false;
  if (!s_dictation) s_dictation = dictation_session_create(0, dictation_result, NULL);
  if (!s_dictation) {
    s_capture_failed = true;
    snprintf(s_notice, sizeof(s_notice), "Voice unavailable. Connect phone and enable speech.");
  } else {
    dictation_session_enable_confirmation(s_dictation, false);
    dictation_session_enable_error_dialogs(s_dictation, false);
    s_dictating = true;
    DictationSessionStatus status = dictation_session_start(s_dictation);
    if (status != DictationSessionStatusSuccess) {
      s_dictating = false;
      s_capture_failed = true;
      snprintf(s_notice, sizeof(s_notice), "Could not start dictation (%d).", (int)status);
    } else {
      return;
    }
  }
  show_notice();
}

static bool read_integer(const Tuple *tuple, int32_t *value) {
  if (!tuple || (tuple->type != TUPLE_INT && tuple->type != TUPLE_UINT)) return false;
  switch (tuple->length) {
    case 1: *value = tuple->type == TUPLE_INT ? tuple->value->int8 : tuple->value->uint8; break;
    case 2: *value = tuple->type == TUPLE_INT ? tuple->value->int16 : tuple->value->uint16; break;
    case 4:
      if (tuple->type == TUPLE_UINT && tuple->value->uint32 > INT32_MAX) return false;
      *value = tuple->value->int32;
      break;
    default: return false;
  }
  return *value >= 0;
}

static void receive(DictionaryIterator *iterator, void *context) {
  (void)context;
  if (!s_alive || !s_busy) return;
  Tuple *status = dict_find(iterator, MESSAGE_KEY_STATUS);
  if (!status || status->type != TUPLE_CSTRING) return;
  Tuple *command = dict_find(iterator, MESSAGE_KEY_COMMAND);
  bool matches = command && command->type == TUPLE_CSTRING &&
                 strcmp(command->value->cstring, s_last_command) == 0;
  int32_t request;
  if (!matches || !read_integer(dict_find(iterator, MESSAGE_KEY_REQUEST_ID), &request) ||
      request != s_request) return;
  bool insertion_reply = s_busy && !s_reload_required && matches &&
    (strcmp(s_last_command, "confirm") == 0 || strcmp(s_last_command, "retry") == 0);
  int32_t expected_token = s_token;
  stop_timeout();
  s_busy = false;
  bool ready = strcmp(s_last_command, "ready") == 0;
  bool cancel = strcmp(s_last_command, "cancel") == 0;
  if (strcmp(status->value->cstring, "error") == 0) {
    Tuple *error = dict_find(iterator, MESSAGE_KEY_ERROR);
    bool has_error = error && error->type == TUPLE_CSTRING && error->length > 1;
    s_show_transcript = has_error && strcmp(s_last_command, "parse") == 0;
    snprintf(s_notice, sizeof(s_notice), "%s",
             error && error->type == TUPLE_CSTRING ? error->value->cstring : "Phone request failed.");
    s_reviewed = false;
    s_reload_required = true;
    if (!s_dictating) show_notice();
    return;
  }
  Tuple *token = dict_find(iterator, MESSAGE_KEY_TOKEN);
  Tuple *title = dict_find(iterator, MESSAGE_KEY_TITLE);
  Tuple *when = dict_find(iterator, MESSAGE_KEY_WHEN);
  Tuple *can_confirm = dict_find(iterator, MESSAGE_KEY_CAN_CONFIRM);
  Tuple *seconds = dict_find(iterator, MESSAGE_KEY_SECONDS_UNTIL);
  int32_t token_value, confirm_value = 0, seconds_value = 0;
  bool home = strcmp(status->value->cstring, "home") == 0;
  if ((!home && strcmp(status->value->cstring, "draft") != 0 &&
       strcmp(status->value->cstring, "pending") != 0) ||
      !read_integer(token, &token_value) ||
      (home && token_value != 0) ||
      (cancel && !home) ||
      (insertion_reply && token_value != expected_token) ||
      (!home && (!read_integer(seconds, &seconds_value) || seconds_value > 366 * 86400)) ||
      (strcmp(status->value->cstring, "draft") == 0 &&
       (!read_integer(can_confirm, &confirm_value) || confirm_value > 1)) ||
      (!home && (!title || title->type != TUPLE_CSTRING || title->length > sizeof(s_title) ||
                 !when || when->type != TUPLE_CSTRING || when->length > sizeof(s_when)))) {
    s_reviewed = false;
    s_reload_required = true;
    snprintf(s_notice, sizeof(s_notice), "Invalid phone response. Reload state.");
    if (!s_dictating) show_notice();
    return;
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "Reply: token bytes=%u, confirm bytes=%u",
          (unsigned)token->length, can_confirm ? (unsigned)can_confirm->length : 0);
  s_reload_required = false;
  s_token = token_value;
  s_draft = strcmp(status->value->cstring, "draft") == 0;
  s_pending = strcmp(status->value->cstring, "pending") == 0;
  s_can_confirm = read_integer(can_confirm, &confirm_value) && confirm_value == 1;
  s_seconds_until = seconds_value;
  s_delta_received_at = time(NULL);
  if (!seconds_value) s_can_confirm = false;
  snprintf(s_title, sizeof(s_title), "%s", title ? title->value->cstring : "");
  snprintf(s_when, sizeof(s_when), "%s", when ? when->value->cstring : "");
  s_reviewed = false;
  if (ready && s_capture_failed) { refresh(); return; }
  Tuple *error = dict_find(iterator, MESSAGE_KEY_ERROR);
  bool has_error = error && error->type == TUPLE_CSTRING && error->length > 1;
  s_show_transcript = has_error && strcmp(s_last_command, "parse") == 0;
  snprintf(s_notice, sizeof(s_notice), "%s",
           error && error->type == TUPLE_CSTRING ? error->value->cstring :
           "");
  if (insertion_reply && s_pending && !has_error) {
    exit_app();
    return;
  }
  if (s_dictating) return;
  if (ready && s_transcript_pending && (!has_error || s_draft)) {
    // A valid saved draft may be unusable in the current zone; new dictation replaces it.
    s_transcript_pending = false;
    s_notice[0] = '\0';
    send_command("parse", s_transcript);
  } else if (has_error) {
    if (cancel || insertion_reply || ready) s_reload_required = true;
    show_notice();
  } else if (s_cancel_to_record && (cancel || ready) && home) {
    s_cancel_to_record = false;
    dictate();
  } else if (s_draft || s_pending) {
    show_review();
  } else {
    dictate();
  }
}

static void outbox_failed(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  (void)reason; (void)context;
  if (!s_alive || !s_busy) return;
  if (iterator) {
    int32_t request;
    if (!read_integer(dict_find(iterator, MESSAGE_KEY_REQUEST_ID), &request) ||
        request != s_request) return;
  }
  stop_timeout();
  s_busy = false;
  s_reload_required = true;
  APP_LOG(APP_LOG_LEVEL_WARNING, "Outbox failed: %d", (int)reason);
  snprintf(s_notice, sizeof(s_notice), "Phone message failed. Reopen to check state.");
  if (!s_dictating) show_notice();
}

static void init(void) {
  s_alive = true;
  s_busy = true;
  snprintf(s_last_command, sizeof(s_last_command), "ready");
  s_review_window = window_create();
  window_set_window_handlers(s_review_window, (WindowHandlers){.load = review_load, .unload = review_unload});
  window_stack_push(s_review_window, false);
  app_message_register_inbox_received(receive);
  app_message_register_outbox_failed(outbox_failed);
  if (app_message_open(1024, 1024) != APP_MSG_OK) {
    snprintf(s_notice, sizeof(s_notice), "Messaging unavailable. Restart the app.");
    s_busy = false;
    s_reload_required = true;
    show_notice();
  } else {
    s_timeout = app_timer_register(12000, timeout, (void *)(intptr_t)s_request);
    dictate();
  }
  tick_timer_service_subscribe(SECOND_UNIT, tick);
}

static void deinit(void) {
  s_alive = false;
  tick_timer_service_unsubscribe();
  stop_timeout();
  if (s_dictation) dictation_session_destroy(s_dictation);
  window_destroy(s_review_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
  return 0;
}
