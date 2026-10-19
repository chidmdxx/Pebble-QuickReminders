#include <assert.h>
#define main watch_entry
#include "../app/src/c/main.c"
#undef main
static int response_launch_code = -1;
static bool response_confirmable = true;

static void response(const char *status, const char *error, int token, int width,
                     const char *command, int seconds, int request) {
  TupleValue values[10] = {0};
  snprintf(values[0].cstring, sizeof(values[0].cstring), "%s", status);
  values[1].int32 = token;
  snprintf(values[2].cstring, sizeof(values[2].cstring), "Synthetic test");
  snprintf(values[3].cstring, sizeof(values[3].cstring), "2026-10-20 3:30 PM");
  values[4].uint32 = 0xffffff01;
  if (width == 2) values[4].uint16 = 1;
  if (width == 4) values[4].uint32 = 1;
  if (!response_confirmable) values[4].uint32 = 0;
  snprintf(values[5].cstring, sizeof(values[5].cstring), "%s", error ? error : "");
  values[6].int32 = seconds;
  snprintf(values[7].cstring, sizeof(values[7].cstring), "%s", command ? command : "");
  values[8].int32 = request;
  values[9].int32 = response_launch_code < 0 ? s_launch_code : response_launch_code;
  Tuple tuples[] = {
    {MESSAGE_KEY_STATUS, TUPLE_CSTRING, (uint16_t)(strlen(status) + 1), &values[0]},
    {MESSAGE_KEY_TOKEN, TUPLE_INT, 4, &values[1]},
    {MESSAGE_KEY_TITLE, TUPLE_CSTRING, 15, &values[2]},
    {MESSAGE_KEY_WHEN, TUPLE_CSTRING, (uint16_t)(strlen(values[3].cstring) + 1), &values[3]},
    {MESSAGE_KEY_CAN_CONFIRM, TUPLE_UINT, (uint16_t)width, &values[4]},
    {MESSAGE_KEY_ERROR, TUPLE_CSTRING, (uint16_t)(strlen(values[5].cstring) + 1), &values[5]},
    {MESSAGE_KEY_SECONDS_UNTIL, TUPLE_INT, 4, &values[6]},
    {MESSAGE_KEY_REQUEST_ID, TUPLE_INT, 4, &values[8]},
    {MESSAGE_KEY_LAUNCH_CODE, TUPLE_INT, 4, &values[9]},
    {MESSAGE_KEY_COMMAND, TUPLE_CSTRING, (uint16_t)(strlen(values[7].cstring) + 1), &values[7]}
  };
  DictionaryIterator iterator = {tuples, command ? 10 : 9};
  receive(&iterator, NULL);
}

static void reply(const char *status, const char *error, int token, int width) {
  response(status, error, token, width, s_last_command, 1200, s_request);
}

static void configuration(int color, int close) {
  TupleValue values[3] = {0};
  snprintf(values[0].cstring, sizeof(values[0].cstring), "settings");
  values[1].int32 = color;
  values[2].int32 = close;
  Tuple tuples[] = {
    {MESSAGE_KEY_COMMAND, TUPLE_CSTRING, 9, &values[0]},
    {MESSAGE_KEY_RIBBON_COLOR, TUPLE_INT, 4, &values[1]},
    {MESSAGE_KEY_AUTO_CLOSE, TUPLE_INT, 4, &values[2]}
  };
  DictionaryIterator iterator = {tuples, 3};
  receive(&iterator, NULL);
}

static void preset_configuration(int first, int second, int third) {
  TupleValue values[4] = {0};
  snprintf(values[0].cstring, sizeof(values[0].cstring), "settings");
  values[1].int32 = first;
  values[2].int32 = second;
  values[3].int32 = third;
  Tuple tuples[] = {
    {MESSAGE_KEY_COMMAND, TUPLE_CSTRING, 9, &values[0]},
    {MESSAGE_KEY_SNOOZE_1, TUPLE_INT, 4, &values[1]},
    {MESSAGE_KEY_SNOOZE_2, TUPLE_INT, 4, &values[2]},
    {MESSAGE_KEY_SNOOZE_3, TUPLE_INT, 4, &values[3]}
  };
  DictionaryIterator iterator = {tuples, 4};
  receive(&iterator, NULL);
}

static void click(int button) {
  if (fake_raw_down[button]) fake_raw_down[button](NULL, NULL);
  fake_clicks[button](NULL, NULL);
}

static void start_launch(int reason, uint32_t code) {
  s_draft = s_pending = s_reviewed = s_busy = s_can_confirm = false;
  s_reviewing_reminder = s_dictating = s_reload_required = s_show_transcript = false;
  s_transcript_pending = s_select_held = s_wait_visible = s_cancel_to_record = false;
  s_capture_failed = false;
  s_token = s_request = 0;
  s_title[0] = s_when[0] = s_notice[0] = s_transcript[0] = '\0';
  fake_outbox_result = 0;
  fake_begin_result = 0;
  fake_text_height = 100;
  fake_title_height = 24;
  fake_launch_reason = reason;
  fake_launch_args = code;
  response_launch_code = -1;
  response_confirmable = true;
  init();
  assert(s_alive && fake_tick == tick && fake_depth == 1);
  if (reason == APP_LAUNCH_TIMELINE_ACTION) {
    assert(!s_dictating);
    assert(s_busy == (code > 0 && code <= 2147483646));
  } else {
    assert(s_dictating && s_busy && !s_review[0]);
    assert(!s_dictation->confirmation && !s_dictation->error_dialogs);
  }
}

static void start(void) { start_launch(0, 0); }

static void timeline_ready(int request) {
  TupleValue values[8] = {0};
  snprintf(values[0].cstring, sizeof(values[0].cstring), "ready");
  values[1].int32 = request;
  snprintf(values[2].cstring, sizeof(values[2].cstring), "pending");
  values[3].int32 = 900;
  snprintf(values[4].cstring, sizeof(values[4].cstring), "Newer synthetic");
  snprintf(values[5].cstring, sizeof(values[5].cstring), "2026-10-21 8:30 PM");
  values[6].int32 = 1200;
  values[7].int32 = 1;
  Tuple tuples[] = {
    {MESSAGE_KEY_COMMAND, TUPLE_CSTRING, 6, &values[0]},
    {MESSAGE_KEY_REQUEST_ID, TUPLE_INT, 4, &values[1]},
    {MESSAGE_KEY_STATUS, TUPLE_CSTRING, 8, &values[2]},
    {MESSAGE_KEY_TOKEN, TUPLE_INT, 4, &values[3]},
    {MESSAGE_KEY_TITLE, TUPLE_CSTRING, 16, &values[4]},
    {MESSAGE_KEY_WHEN, TUPLE_CSTRING, 19, &values[5]},
    {MESSAGE_KEY_SECONDS_UNTIL, TUPLE_INT, 4, &values[6]},
    {MESSAGE_KEY_CAN_CONFIRM, TUPLE_INT, 4, &values[7]}
  };
  DictionaryIterator iterator = {tuples, 8};
  receive(&iterator, NULL);
}

static void start_timeline(uint32_t code) {
  int sends = fake_sends;
  start_launch(APP_LAUNCH_TIMELINE_ACTION, code);
  assert(fake_sends == sends && s_token == 0 && !s_title[0]);
  timeline_ready(0);
  assert(fake_sends == sends + 1 && !strcmp(fake_command, "pin_open") &&
         fake_launch_code == (int32_t)code && fake_token == 0);
}

static void finish(void) {
  window_stack_pop_all(false);
  deinit();
  s_dictation = NULL;
  s_schedule_window = NULL;
  assert(!fake_tick && !s_timeout && !s_feedback && !s_review_title && !s_review_text);
  for (int i = 0; i < fake_timer_count; i++) assert(!fake_timers[i].active);
}

static void draft(void) {
  reply("home", NULL, 0, 4);
  dictation_result(s_dictation, DictationSessionStatusSuccess, "Synthetic test in 20 minutes", NULL);
  assert(s_busy && strcmp(fake_command, "parse") == 0);
  reply("draft", NULL, 1, 1);
  assert(s_can_confirm && s_reviewed && s_reviewing_reminder);
  assert(s_review_window->click_owner == s_action_bar);
  assert(s_action_bar->icons[BUTTON_ID_SELECT] == s_icons[ICON_CONFIRM]);
  assert(s_action_bar->background_color == PBL_IF_COLOR_ELSE(GColorDarkCandyAppleRed, GColorBlack));
#ifdef PBL_COLOR
  assert(s_icons[ICON_CONFIRM]->palette[0] == GColorClear &&
         s_icons[ICON_CONFIRM]->palette[1] == GColorWhite &&
         !s_icons[ICON_CONFIRM]->palette_owned);
  assert(s_icons[ICON_CONFIRM]->data[9] == 0x04 &&
         s_icons[ICON_CONFIRM]->data[20] == 0x07 &&
         s_icons[ICON_CONFIRM]->data[21] == 0x80);
#else
  assert(!s_icons[ICON_CONFIRM]->palette);
  assert(s_icons[ICON_CONFIRM]->data[9] == 0x20 &&
         s_icons[ICON_CONFIRM]->data[20] == 0xe0 &&
         s_icons[ICON_CONFIRM]->data[21] == 0x01);
#endif
  assert(!s_action_bar->icons[BUTTON_ID_UP] && !s_action_bar->icons[BUTTON_ID_DOWN]);
  assert(s_action_bar->static_icons[BUTTON_ID_SELECT]);
  assert(strstr(s_review, "In 20 min") && !strstr(s_review, "Select:"));
  assert(s_scroll->layer.bounds.origin.x + s_scroll->layer.bounds.size.w <=
         s_review_window->root.bounds.size.w - ACTION_BAR_WIDTH);
  assert(s_scroll->layer.bounds.origin.x == 0 && s_scroll->layer.bounds.origin.y == 0);
  assert(s_scroll->layer.bounds.size.h == s_review_window->root.bounds.size.h);
  assert(s_scroll->layer.bounds.size.w ==
         s_review_window->root.bounds.size.w - ACTION_BAR_WIDTH - REVIEW_INSET);
  assert(s_review_text->screen_flow && s_review_text->flow_hierarchy_ready &&
         s_review_text->flow_inset == REVIEW_INSET);
  assert(!strcmp(s_review_title->font, FONT_KEY_GOTHIC_24_BOLD));
  assert(!strcmp(s_review_text->font, FONT_KEY_GOTHIC_24));
  assert(!strcmp(s_review_title->text, s_title));
  assert(s_review_title->screen_flow && s_review_title->flow_hierarchy_ready);
  assert(s_review_title->layer.bounds.size.h == fake_title_height + TITLE_DESCENDER_PAD);
  assert(s_review_text->layer.bounds.origin.y == fake_title_height + TITLE_DESCENDER_PAD + REVIEW_INSET);
  if (PBL_IF_ROUND_ELSE(PBL_DISPLAY_WIDTH >= 240, false)) {
    assert(2 * s_review_text->layer.bounds.origin.x + s_review_text->layer.bounds.size.w ==
           s_review_window->root.bounds.size.w);
  } else {
    assert(s_review_text->layer.bounds.origin.x == 0);
  }
  assert(s_review_text->layer.bounds.origin.x + s_review_text->layer.bounds.size.w ==
         s_scroll->layer.bounds.size.w);
  assert(strstr(s_review, PBL_DISPLAY_WIDTH < 200 ?
                "2026-10-20\n3:30 PM\nIn 20 min" : "2026-10-20 3:30 PM\nIn 20 min"));
  assert(s_scroll->paging && scroll_layer_get_content_size(s_scroll).h %
         s_scroll->layer.bounds.size.h == 0);
}

int main(void) {
  const int seconds[] = {0, 1, 59, 60, 61, 600, 3600, 3660, 86400, 90060, 31622400};
  const char *deltas[] = {"Due now / past", "In <1 min", "In <1 min", "In 1 min",
    "In 2 min", "In 10 min", "In 1h", "In 1h 1m", "In 1d", "In 1d 1h 1m", "In 366d"};
  for (int i = 0; i < 11; i++) {
    char text[40];
    format_delta(text, sizeof(text), seconds[i]);
    assert(strcmp(text, deltas[i]) == 0);
  }
  TupleValue data;
  Tuple tuple = {MESSAGE_KEY_TOKEN, TUPLE_UINT, 1, &data};
  int32_t value;
  for (int type = TUPLE_INT; type <= TUPLE_UINT; type++) {
    tuple.type = type;
    for (int width = 1; width <= 4; width *= 2) {
      tuple.length = width;
      data.uint32 = 0xffffff01;
      if (width == 2) data.uint16 = 1;
      if (width == 4) data.uint32 = 1;
      assert(read_integer(&tuple, &value) && value == 1);
    }
  }
  data.uint32 = UINT32_MAX;
  assert(!read_integer(&tuple, &value));
  tuple.type = TUPLE_INT;
  assert(!read_integer(&tuple, &value));
  tuple.length = 3;
  assert(!read_integer(&tuple, &value) && !read_integer(NULL, &value));

  // Capture may finish before the phone is ready; copy, then flush exactly once.
  start();
  int sent = fake_sends, starts = fake_dictation_starts;
  char transcript[] = "Synthetic early test in 20 minutes";
  dictation_result(s_dictation, DictationSessionStatusSuccess, transcript, NULL);
  transcript[0] = 'X';
  assert(s_transcript_pending && fake_sends == sent && s_transcript[0] == 'S');
  reply("pending", NULL, 42, 4);
  assert(fake_sends == sent + 1 && !s_transcript_pending && s_busy);
  response("home", NULL, 0, 4, "ready", 1200, 0);
  assert(s_busy && fake_sends == sent + 1 && fake_dictation_starts == starts);
  reply("draft", NULL, 43, 2);
  assert(s_draft && s_token == 43);
  sent = fake_sends;
  review_select(NULL, NULL);
  assert(fake_sends == sent); // A native held-Select release is not a new press.
  finish();

  // Fresh captured text can replace a saved draft invalidated by timezone travel.
  start();
  sent = fake_sends;
  dictation_result(s_dictation, DictationSessionStatusSuccess, "Synthetic replacement in 20 minutes", NULL);
  reply("draft", "Phone timezone changed. Dictate and review again.", 9, 4);
  assert(s_busy && !s_reload_required && !s_transcript_pending && !s_notice[0]);
  assert(fake_sends == sent + 1 && strcmp(fake_command, "parse") == 0);
  response("draft", "Phone timezone changed. Dictate and review again.", 9, 4, "ready", 1200, 0);
  assert(fake_sends == sent + 1 && s_busy);
  reply("draft", NULL, 10, 4);
  assert(s_draft && s_token == 10 && s_can_confirm && !s_reload_required);
  finish();

  // A real readiness/storage failure must not flush text or lose the error.
  start();
  sent = fake_sends;
  dictation_result(s_dictation, DictationSessionStatusSuccess, "Synthetic early test in 20 minutes", NULL);
  reply("error", "Storage unavailable.", 0, 4);
  assert(s_transcript_pending && s_reload_required && fake_sends == sent);
  assert(strstr(s_review, "Storage unavailable."));
  click(BUTTON_ID_SELECT);
  assert(strcmp(fake_command, "ready") == 0 && fake_sends == sent + 1);
  reply("error", "Storage unavailable.", 0, 4);
  assert(s_transcript_pending && s_reload_required && fake_sends == sent + 1);
  finish();

  start();
  starts = fake_dictation_starts;
  sent = fake_sends;
  reply("pending", NULL, 9, 4);
  assert(s_dictating && s_pending && fake_dictation_starts == starts && fake_sends == sent);
  finish();

  // Bold title height participates in paging and full-review eligibility.
  start();
  draft();
  fake_title_height = 600;
  show_review();
  assert(!s_reviewed && s_review_text->layer.bounds.origin.y >= 600 + TITLE_DESCENDER_PAD + REVIEW_INSET);
  int title_bottom = scroll_layer_get_content_size(s_scroll).h - s_scroll->layer.bounds.size.h;
  scroll_layer_set_content_offset(s_scroll, GPoint(0, -title_bottom + 1), false);
  assert(!s_reviewed);
  click(BUTTON_ID_DOWN);
  assert(s_reviewed && s_scroll->offset.y == -title_bottom);
  finish();

  // Date/time and countdown move together rather than splitting at the round rim.
  start();
  draft();
  fake_text_height = 72;
  fake_title_height = PBL_DISPLAY_HEIGHT - TITLE_DESCENDER_PAD - REVIEW_INSET - 48;
  show_review();
  assert(s_review_text->layer.bounds.origin.y ==
         PBL_DISPLAY_HEIGHT + PBL_IF_ROUND_ELSE(PBL_DISPLAY_HEIGHT / 5, REVIEW_INSET));
  assert(!s_reviewed);
  click(BUTTON_ID_DOWN);
  assert(s_reviewed);
  finish();

  // Native Back is status 1, not the error/rejection variants.
  start();
  sent = fake_sends;
  int stopped = fake_dictation_stops;
  click(BUTTON_ID_BACK);
  assert(!s_alive && !fake_depth && fake_dictation_stops == stopped + 1 && fake_sends == sent);
  reply("home", NULL, 0, 4);
  assert(!fake_depth);
  finish();

  start();
  starts = fake_dictation_starts;
  sent = fake_sends;
  AppTimer *late = s_timeout;
  dictation_result(s_dictation, DictationSessionStatusFailureTranscriptionRejected, NULL, NULL);
  reply("pending", NULL, 4, 4);
  late->callback(late->context);
  assert(!s_alive && !fake_depth && fake_dictation_starts == starts && fake_sends == sent);
  finish();
  for (int status = DictationSessionStatusFailureTranscriptionRejectedWithError;
       status <= DictationSessionStatusFailureRecognizerError; status++) {
    start();
    memset(fake_clicks, 0, sizeof(fake_clicks));
    dictation_result(s_dictation, status, NULL, NULL);
    assert(s_alive && strstr(s_review, "Dictation failed"));
    assert(!s_review_title->text[0] && s_review_text->layer.bounds.origin.y == 0);
    assert(fake_clicks[BUTTON_ID_SELECT] == review_select && fake_clicks[BUTTON_ID_BACK] == review_back);
    reply("draft", NULL, 9, 4);
    assert(strstr(s_review, "Dictation failed") && !s_reviewing_reminder);
    finish();
  }

  // Long Select and its release cannot become a confirm, even across a new card.
  start();
  draft();
  sent = fake_sends;
  fake_raw_down[BUTTON_ID_SELECT](NULL, NULL);
  fake_long_clicks[BUTTON_ID_SELECT](NULL, NULL);
  if (fake_long_release[BUTTON_ID_SELECT]) fake_long_release[BUTTON_ID_SELECT](NULL, NULL);
  fake_clicks[BUTTON_ID_SELECT](NULL, NULL);
  assert(fake_sends == sent);
  char stable[sizeof(s_review)];
  snprintf(stable, sizeof(stable), "%s", s_review);
  click(BUTTON_ID_SELECT);
  assert(s_busy && strcmp(fake_command, "confirm") == 0 && !strcmp(stable, s_review));
  AppTimer *wait = s_feedback, *watchdog = s_timeout;
  click(BUTTON_ID_SELECT);
  assert(fake_sends == sent + 1);
  response("pending", NULL, 1, 4, "ready", 1200, s_request);
  response("pending", NULL, 1, 4, NULL, 1200, s_request);
  assert(s_busy && s_timeout == watchdog);
  reply("pending", NULL, 1, 4);
  assert(!s_alive && !fake_depth && !wait->active && !watchdog->active);
  wait->callback(wait->context);
  watchdog->callback(watchdog->context);
  assert(!fake_depth);
  finish();

  // Back cancels only a draft, waits for acknowledgement, and records once.
  start();
  draft();
  sent = fake_sends;
  starts = fake_dictation_starts;
  click(BUTTON_ID_BACK);
  assert(s_busy && !s_reviewed && strcmp(fake_command, "cancel") == 0);
  review_select(NULL, NULL);
  assert(fake_sends == sent + 1);
  reply("home", NULL, 0, 4);
  assert(s_dictating && fake_dictation_starts == starts + 1 && !s_busy);
  reply("home", NULL, 0, 4);
  review_select(NULL, NULL);
  assert(fake_dictation_starts == starts + 1 && fake_sends == sent + 1);
  finish();

  // Failed/uncertain cancellation is visibly recoverable; stale replies stay stale.
  start();
  draft();
  click(BUTTON_ID_BACK);
  int cancel_request = s_request;
  late = s_timeout;
  fake_fire(s_timeout);
  assert(s_reload_required && strstr(s_review, "No phone response"));
  response("home", NULL, 0, 4, "cancel", 1200, cancel_request);
  assert(s_reload_required && !s_dictating);
  click(BUTTON_ID_SELECT);
  assert(s_busy && strcmp(fake_command, "ready") == 0);
  late->callback(late->context);
  TupleValue old_request = {.int32 = cancel_request};
  Tuple old_tuple = {MESSAGE_KEY_REQUEST_ID, TUPLE_INT, 4, &old_request};
  DictionaryIterator old_outbox = {&old_tuple, 1};
  outbox_failed(&old_outbox, 1, NULL);
  assert(s_busy && s_timeout);
  response("home", NULL, 0, 4, "ready", 1200, 0);
  assert(s_busy);
  reply("draft", "Synthetic cancel failure", 1, 4);
  assert(s_reload_required && strstr(s_review, "Synthetic cancel failure"));
  click(BUTTON_ID_SELECT);
  reply("draft", NULL, 1, 4);
  click(BUTTON_ID_BACK);
  reply("home", NULL, 0, 4);
  assert(s_dictating);
  finish();

  start();
  draft();
  fake_begin_result = 1;
  click(BUTTON_ID_BACK);
  assert(s_reload_required && !s_busy && !s_dictating);
  fake_begin_result = 0;
  click(BUTTON_ID_SELECT);
  reply("draft", NULL, 1, 4);
  click(BUTTON_ID_BACK);
  reply("home", NULL, 0, 4);
  assert(s_dictating);
  finish();

  // Delayed feedback is inline; timeout/error requires reload before retry.
  start();
  draft();
  click(BUTTON_ID_SELECT);
  wait = s_feedback;
  fake_fire(wait);
  assert(s_wait_visible && s_reviewing_reminder && strstr(s_review, "Waiting for phone"));
  reply("pending", "Synthetic insertion failure", 1, 4);
  assert(s_alive && s_reload_required && strstr(s_review, "Synthetic insertion failure"));
  response("pending", NULL, 1, 4, "confirm", 1200, s_request);
  assert(s_alive);
  click(BUTTON_ID_SELECT);
  fake_text_height = 400;
  reply("pending", NULL, 1, 4);
  assert(s_pending && !s_reviewed && strstr(s_review, "delivery NOT verified"));
  sent = fake_sends;
  click(BUTTON_ID_SELECT);
  assert(fake_sends == sent);
  int bottom = scroll_layer_get_content_size(s_scroll).h -
    layer_get_bounds(scroll_layer_get_layer(s_scroll)).size.h;
  scroll_layer_set_content_offset(s_scroll, GPoint(0, -bottom + 1), false);
  assert(!s_reviewed);
  click(BUTTON_ID_DOWN);
  assert(s_scroll->offset.y == -bottom);
  assert(s_reviewed);
  click(BUTTON_ID_UP);
  assert(s_scroll->offset.y == -(bottom > PBL_DISPLAY_HEIGHT ? bottom - PBL_DISPLAY_HEIGHT : 0));
  click(BUTTON_ID_DOWN);
  assert(s_scroll->offset.y == -bottom);
  click(BUTTON_ID_SELECT);
  assert(s_busy && !strcmp(fake_command, "retry"));
  reply("pending", NULL, 2, 4);
  assert(s_alive && s_reload_required);
  click(BUTTON_ID_SELECT);
  reply("pending", NULL, 1, 4);
  scroll_layer_set_content_offset(s_scroll, GPoint(0, -bottom), false);
  click(BUTTON_ID_SELECT);
  reply("pending", NULL, 1, 4);
  assert(!s_alive);
  finish();

  start();
  draft();
  click(BUTTON_ID_SELECT);
  outbox_failed(NULL, 1, NULL);
  click(BUTTON_ID_SELECT);
  reply("pending", NULL, 1, 4);
  sent = fake_sends;
  starts = fake_dictation_starts;
  click(BUTTON_ID_BACK);
  assert(s_dictating && fake_sends == sent && fake_dictation_starts == starts + 1);
  finish();

  // Countdown-only reflow cannot grant review. Expiry remains a hard fence.
  start();
  reply("home", NULL, 0, 4);
  dictation_result(s_dictation, DictationSessionStatusSuccess, "Synthetic in 1 minute", NULL);
  fake_text_height = 400;
  response("draft", NULL, 3, 4, "parse", 61, s_request);
  assert(!s_reviewed);
  fake_text_height = 100;
  fake_now += 2;
  tick(NULL, SECOND_UNIT);
  assert(!s_reviewed && !strcmp(s_delta, "In <1 min"));
  click(BUTTON_ID_DOWN);
  assert(s_reviewed);
  fake_now += 59;
  tick(NULL, SECOND_UNIT);
  sent = fake_sends;
  click(BUTTON_ID_SELECT);
  assert(!s_can_confirm && fake_sends == sent && strstr(s_review, "Back: record again"));
  finish();

  // Readiness timeout doesn't erase a retained transcript; explicit reload flushes it.
  start();
  fake_fire(s_timeout);
  dictation_result(s_dictation, DictationSessionStatusSuccess, "Synthetic early in 20 minutes", NULL);
  assert(s_reload_required && s_transcript_pending);
  assert(strstr(s_review, "No phone response"));
  click(BUTTON_ID_SELECT);
  reply("home", NULL, 0, 4);
  assert(s_busy && !s_transcript_pending && !strcmp(fake_command, "parse"));
  finish();

  // Settings are independent of the request lifecycle, even while awaiting insertion.
  start();
  draft();
  sent = fake_sends;
  configuration(194, 0);
  assert(!s_busy && s_draft && s_reviewed && s_can_confirm && fake_sends == sent);
  assert(s_action_bar->background_color == PBL_IF_COLOR_ELSE(194, GColorBlack) && !s_auto_close);
  configuration(255, 1);
  configuration(224, 2);
  configuration(-1, 1);
  assert(s_action_bar->background_color == PBL_IF_COLOR_ELSE(194, GColorBlack) && !s_auto_close);
  click(BUTTON_ID_SELECT);
  AppTimer *insertion_timeout = s_timeout;
  int insertion_request = s_request;
  configuration(226, 0);
  assert(s_busy && s_timeout == insertion_timeout && s_request == insertion_request);
  assert(s_action_bar->background_color == PBL_IF_COLOR_ELSE(226, GColorBlack) && fake_sends == sent + 1);
  reply("pending", NULL, 1, 4);
  assert(s_alive && !s_busy && s_saved_notice && !s_reviewing_reminder);
  assert(strstr(s_review, "Check Timeline") && strstr(s_review, "delivery is not confirmed"));
  assert(!insertion_timeout->active);
  sent = fake_sends;
  click(BUTTON_ID_SELECT);
  assert(s_dictating && !s_saved_notice && fake_sends == sent);
  finish();

  // Cached preferences apply before phone readiness; Back exits the saved notice.
  start();
  assert(s_ribbon_color == 226 && !s_auto_close &&
         s_action_bar->background_color == PBL_IF_COLOR_ELSE(226, GColorBlack));
  configuration(224, 0);
  draft();
  click(BUTTON_ID_SELECT);
  reply("pending", NULL, 1, 4);
  assert(s_alive && s_saved_notice);
  sent = fake_sends;
  click(BUTTON_ID_BACK);
  assert(!s_alive && fake_sends == sent);
  configuration(194, 1);
  assert(s_ribbon_color == 224 && !s_auto_close);
  finish();

  start();
  configuration(224, 1);
  draft();
  click(BUTTON_ID_SELECT);
  reply("pending", NULL, 1, 4);
  assert(!s_alive);
  finish();
  start();
  assert(s_ribbon_color == 224 && s_auto_close);
  finish();

  // A regular readiness reply repairs a missed configuration delivery.
  start();
  TupleValue ready_values[6] = {0};
  snprintf(ready_values[0].cstring, sizeof(ready_values[0].cstring), "ready");
  snprintf(ready_values[1].cstring, sizeof(ready_values[1].cstring), "home");
  ready_values[4].int32 = 194;
  Tuple ready_tuples[] = {
    {MESSAGE_KEY_COMMAND, TUPLE_CSTRING, 6, &ready_values[0]},
    {MESSAGE_KEY_STATUS, TUPLE_CSTRING, 5, &ready_values[1]},
    {MESSAGE_KEY_TOKEN, TUPLE_INT, 4, &ready_values[2]},
    {MESSAGE_KEY_REQUEST_ID, TUPLE_INT, 4, &ready_values[3]},
    {MESSAGE_KEY_RIBBON_COLOR, TUPLE_UINT, 1, &ready_values[4]},
    {MESSAGE_KEY_AUTO_CLOSE, TUPLE_UINT, 1, &ready_values[5]}
  };
  DictionaryIterator ready_iterator = {ready_tuples, 6};
  receive(&ready_iterator, NULL);
  assert(!s_busy && s_dictating && s_ribbon_color == 194 && !s_auto_close);
  assert(s_action_bar->background_color == PBL_IF_COLOR_ELSE(194, GColorBlack) && fake_settings == 194);
  finish();
  // Timeline waits for JS readiness, then opens only the launch target, not ready's latest pin.
  starts = fake_dictation_starts;
  sent = fake_sends;
  start_launch(APP_LAUNCH_TIMELINE_ACTION, 73);
  assert(fake_dictation_starts == starts && fake_sends == sent);
  assert(s_busy && s_token == 0 && !s_title[0] && !s_schedule_menu);
  timeline_ready(7);
  assert(fake_sends == sent && s_busy && s_token == 0);
  timeline_ready(0);
  assert(fake_sends == sent + 1 && !strcmp(fake_command, "pin_open"));
  assert(fake_launch_code == 73 && fake_token == 0 && !s_title[0]);
  int open_request = s_request;
  timeline_ready(0);
  assert(fake_sends == sent + 1 && s_busy && s_request == open_request &&
         s_token == 0 && !s_schedule_menu);
  response_launch_code = 74;
  reply("schedule", NULL, 21, 4);
  assert(s_busy && s_token == 0);
  response_launch_code = -1;
  reply("schedule", NULL, 21, 4);
  assert(!s_busy && s_schedule_menu && fake_depth == 2 && s_token == 21);
  timeline_ready(0);
  assert(fake_sends == sent + 1 && !s_busy && s_schedule_menu && s_token == 21);
  assert(s_schedule_section.num_items == 4 && !strcmp(s_schedule_section.title, "Synthetic test"));
  assert(!strcmp(s_schedule_items[0].title, "In 5 minutes"));
  assert(!strcmp(s_schedule_items[3].title, "New time") && s_schedule_items[3].subtitle == s_when);
  click(BUTTON_ID_DOWN);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_preset") && !strcmp(fake_text, "1") &&
         fake_launch_code == 73 && fake_token == 21);
  fake_text_height = 500;
  reply("draft", NULL, 22, 4);
  assert(!s_schedule_menu && fake_depth == 1 && s_draft && !s_reviewed);
  sent = fake_sends;
  timeline_ready(0);
  assert(fake_sends == sent && s_token == 22 && s_draft && !s_busy && !s_schedule_menu);
  click(BUTTON_ID_SELECT);
  assert(fake_sends == sent);
  for (int i = 0; i < 8; i++) click(BUTTON_ID_DOWN);
  assert(s_reviewed);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_confirm") && fake_token == 22 && fake_launch_code == 73);
  sent = fake_sends;
  timeline_ready(0);
  assert(s_busy && fake_sends == sent && s_token == 22 && !strcmp(fake_command, "pin_confirm"));
  reply("pending", NULL, 22, 4);
  assert(!s_alive && fake_dictation_starts == starts);
  finish();

  // Speech failure / late ready cannot reveal or confirm a different reminder.
  start_timeline(74);
  reply("schedule", NULL, 31, 4);
  for (int i = 0; i < 3; i++) click(BUTTON_ID_DOWN);
  click(BUTTON_ID_SELECT);
  assert(s_dictating && !s_schedule_menu);
  dictation_result(s_dictation, DictationSessionStatusFailureNoSpeechDetected, NULL, NULL);
  assert(!s_dictating && !s_reviewing_reminder && strstr(s_notice, "Dictation failed"));
  response("pending", NULL, 900, 4, "ready", 1200, 0);
  assert(!s_reviewing_reminder && s_token == 31);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_open") && fake_launch_code == 74);
  reply("schedule", NULL, 31, 4);
  for (int i = 0; i < 3; i++) click(BUTTON_ID_DOWN);
  click(BUTTON_ID_SELECT);
  dictation_result(s_dictation, DictationSessionStatusSuccess, "en media hora", NULL);
  assert(!strcmp(fake_command, "pin_time") && !strcmp(fake_text, "en media hora") &&
         fake_token == 31 && fake_launch_code == 74);
  reply("draft", NULL, 32, 4);
  click(BUTTON_ID_BACK);
  assert(s_busy && !strcmp(fake_command, "pin_cancel") && fake_token == 32);
  reply("home", NULL, 0, 4);
  assert(!s_alive);
  finish();

  // Timeline timeout reloads only that pin, and Back during an in-flight preview exits.
  start_timeline(75);
  fake_fire(s_timeout);
  assert(s_reload_required && !s_dictating);
  response("draft", NULL, 44, 4, "pin_open", 1200, s_request);
  assert(s_reload_required && s_token == 0);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_open") && fake_launch_code == 75);
  reply("schedule", NULL, 41, 4);
  click(BUTTON_ID_SELECT);
  assert(s_busy && !strcmp(fake_command, "pin_preset"));
  click(BUTTON_ID_BACK);
  assert(!s_alive && !s_dictating);
  finish();

  start_timeline(76);
  reply("schedule", NULL, 51, 4);
  click(BUTTON_ID_BACK);
  assert(!strcmp(fake_command, "pin_cancel") && fake_token == 51);
  reply("home", NULL, 0, 4);
  assert(!s_alive);
  finish();

  // Confirmation uncertainty requires targeted reload and explicit retry, not replay.
  start_timeline(77);
  reply("schedule", NULL, 61, 4);
  click(BUTTON_ID_SELECT);
  reply("draft", NULL, 62, 4);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_confirm") && fake_token == 62);
  fake_fire(s_timeout);
  sent = fake_sends;
  timeline_ready(0);
  assert(fake_sends == sent && s_reload_required && s_token == 62);
  response("pending", NULL, 62, 4, "pin_confirm", 1200, s_request);
  assert(s_reload_required && fake_sends == sent);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_open") && fake_launch_code == 77 && fake_token == 62);
  reply("pending", NULL, 62, 4);
  assert(s_alive && s_pending && s_reviewing_reminder && !s_busy);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_retry") && fake_token == 62 && fake_launch_code == 77);
  reply("pending", NULL, 62, 4);
  assert(!s_alive);
  finish();

  // A configuration change fences displayed labels until a targeted reopen.
  start_timeline(78);
  reply("schedule", NULL, 71, 4);
  preset_configuration(7, 15, 45);
  assert(!s_schedule_menu && s_reload_required && s_token == 71);
  click(BUTTON_ID_SELECT);
  reply("schedule", NULL, 71, 4);
  assert(s_schedule_menu && !strcmp(s_schedule_items[0].title, "In 7 minutes") &&
         !strcmp(s_schedule_items[2].title, "In 45 minutes"));
  preset_configuration(0, 15, 45);
  assert(s_reload_required && !s_schedule_menu && s_presets[0] == 7);
  click(BUTTON_ID_BACK);
  assert(!s_alive);
  finish();

  // A genuinely late first handshake can open once; cancellation prevents even that.
  sent = fake_sends;
  start_launch(APP_LAUNCH_TIMELINE_ACTION, 79);
  fake_fire(s_timeout);
  assert(s_reload_required && fake_sends == sent && s_token == 0);
  click(BUTTON_ID_SELECT);
  assert(s_busy && fake_sends == sent && s_token == 0 && !s_reload_required);
  timeline_ready(0);
  assert(fake_sends == sent + 1 && s_busy && !strcmp(fake_command, "pin_open") &&
         fake_launch_code == 79 && fake_token == 0);
  timeline_ready(0);
  assert(fake_sends == sent + 1 && s_busy && s_token == 0);
  click(BUTTON_ID_BACK);
  assert(!s_alive);
  finish();

  sent = fake_sends;
  start_launch(APP_LAUNCH_TIMELINE_ACTION, 80);
  click(BUTTON_ID_BACK);
  timeline_ready(0);
  assert(!s_alive && fake_sends == sent);
  finish();

  // A matched unsubmitted timezone-error draft remains cancelable after repeated reloads.
  start_timeline(81);
  response_confirmable = false;
  reply("draft", "Phone timezone changed. Dictate and review again.", 81, 4);
  assert(s_alive && s_draft && !s_can_confirm && s_reload_required);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_open") && fake_launch_code == 81 && fake_token == 81);
  reply("draft", "Phone timezone changed. Dictate and review again.", 81, 4);
  sent = fake_sends;
  click(BUTTON_ID_BACK);
  assert(s_alive && s_busy && fake_sends == sent + 1 && !s_can_confirm &&
         !strcmp(fake_command, "pin_cancel") && fake_launch_code == 81 && fake_token == 81);
  reply("home", NULL, 0, 4);
  assert(!s_alive);
  finish();

  // Native speech rejection cancels the exact open edit and waits for a valid acknowledgement.
  start_timeline(82);
  reply("schedule", NULL, 82, 4);
  for (int i = 0; i < 3; i++) click(BUTTON_ID_DOWN);
  click(BUTTON_ID_SELECT);
  assert(s_dictating && !strcmp(s_schedule_items[3].title, "New time"));
  sent = fake_sends;
  dictation_result(s_dictation, DictationSessionStatusFailureTranscriptionRejected, NULL, NULL);
  assert(s_alive && !s_dictating && s_busy && fake_sends == sent + 1 &&
         !strcmp(fake_command, "pin_cancel") && fake_launch_code == 82 && fake_token == 82);
  click(BUTTON_ID_BACK);
  assert(s_alive && s_busy && fake_sends == sent + 1);
  reply("error", "Could not cancel. Reload this pin.", 0, 4);
  assert(s_alive && !s_busy && s_reload_required && strstr(s_notice, "Could not cancel"));
  sent = fake_sends;
  response("home", NULL, 0, 4, "pin_cancel", 0, s_request - 1);
  assert(s_alive && fake_sends == sent);
  click(BUTTON_ID_SELECT);
  assert(!strcmp(fake_command, "pin_open") && fake_launch_code == 82);
  reply("schedule", NULL, 82, 4);
  click(BUTTON_ID_BACK);
  assert(s_alive && s_busy && !strcmp(fake_command, "pin_cancel") && fake_token == 82);
  reply("home", NULL, 0, 4);
  assert(!s_alive);
  finish();

  // A failed cancel send remains visible and reloadable, not falsely acknowledged.
  start_timeline(83);
  reply("schedule", NULL, 83, 4);
  for (int i = 0; i < 3; i++) click(BUTTON_ID_DOWN);
  click(BUTTON_ID_SELECT);
  fake_outbox_result = 1;
  dictation_result(s_dictation, DictationSessionStatusFailureTranscriptionRejected, NULL, NULL);
  assert(s_alive && !s_busy && s_reload_required && strstr(s_notice, "Could not send"));
  fake_outbox_result = 0;
  click(BUTTON_ID_SELECT);
  reply("schedule", NULL, 83, 4);
  click(BUTTON_ID_BACK);
  assert(s_alive && s_busy && !strcmp(fake_command, "pin_cancel"));
  fake_fire(s_timeout);
  assert(s_alive && !s_busy && s_reload_required && strstr(s_notice, "No phone response"));
  sent = fake_sends;
  reply("home", NULL, 0, 4);
  assert(s_alive && fake_sends == sent);
  click(BUTTON_ID_BACK);
  assert(!s_alive && fake_sends == sent);
  finish();

  // Submitted/uncertain states and unvalidated replies never authorize cancellation.
  for (int i = 0; i < 3; i++) {
    start_timeline(84);
    if (i < 2) reply("pending", i ? "Insertion uncertain. Reload this pin." : NULL, 84, 4);
    else {
      reply("schedule", NULL, 84, 4);
      click(BUTTON_ID_SELECT);
      reply("draft", "Malformed reply", 85, 3);
    }
    sent = fake_sends;
    click(BUTTON_ID_BACK);
    assert(!s_alive && fake_sends == sent);
    finish();
  }

  for (int i = 0; i < 2; i++) {
    starts = fake_dictation_starts;
    start_launch(APP_LAUNCH_TIMELINE_ACTION, i ? UINT32_MAX : 0);
    assert(s_reload_required && !s_busy && fake_dictation_starts == starts);
    click(BUTTON_ID_BACK);
    assert(!s_alive);
    finish();
  }
  // A non-Timeline Quick Launch reason still dictates before readiness.
  starts = fake_dictation_starts;
  start_launch(2, 73);
  assert(!s_timeline && fake_dictation_starts == starts + 1 && s_dictating && s_busy);
  finish();
  puts("Watch lifecycle, native cancellation, correlated replies, timers and review tests passed.");
  return 0;
}
