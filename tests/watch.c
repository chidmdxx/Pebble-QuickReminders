#include <assert.h>
#define main watch_entry
#include "../app/src/c/main.c"
#undef main

static void response(const char *status, const char *error, int token, int width,
                     const char *command, int seconds, int request) {
  TupleValue values[9] = {0};
  snprintf(values[0].cstring, sizeof(values[0].cstring), "%s", status);
  values[1].int32 = token;
  snprintf(values[2].cstring, sizeof(values[2].cstring), "Synthetic test");
  snprintf(values[3].cstring, sizeof(values[3].cstring), "2026-10-20\n15:30");
  values[4].uint32 = 0xffffff01;
  if (width == 2) values[4].uint16 = 1;
  if (width == 4) values[4].uint32 = 1;
  snprintf(values[5].cstring, sizeof(values[5].cstring), "%s", error ? error : "");
  values[6].int32 = seconds;
  snprintf(values[7].cstring, sizeof(values[7].cstring), "%s", command ? command : "");
  values[8].int32 = request;
  Tuple tuples[] = {
    {MESSAGE_KEY_STATUS, TUPLE_CSTRING, (uint16_t)(strlen(status) + 1), &values[0]},
    {MESSAGE_KEY_TOKEN, TUPLE_INT, 4, &values[1]},
    {MESSAGE_KEY_TITLE, TUPLE_CSTRING, 15, &values[2]},
    {MESSAGE_KEY_WHEN, TUPLE_CSTRING, 17, &values[3]},
    {MESSAGE_KEY_CAN_CONFIRM, TUPLE_UINT, (uint16_t)width, &values[4]},
    {MESSAGE_KEY_ERROR, TUPLE_CSTRING, (uint16_t)(strlen(values[5].cstring) + 1), &values[5]},
    {MESSAGE_KEY_SECONDS_UNTIL, TUPLE_INT, 4, &values[6]},
    {MESSAGE_KEY_REQUEST_ID, TUPLE_INT, 4, &values[8]},
    {MESSAGE_KEY_COMMAND, TUPLE_CSTRING, (uint16_t)(strlen(values[7].cstring) + 1), &values[7]}
  };
  DictionaryIterator iterator = {tuples, command ? 9 : 8};
  receive(&iterator, NULL);
}

static void reply(const char *status, const char *error, int token, int width) {
  response(status, error, token, width, s_last_command, 1200, s_request);
}

static void click(int button) {
  if (fake_raw_down[button]) fake_raw_down[button](NULL, NULL);
  fake_clicks[button](NULL, NULL);
}

static void start(void) {
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
  init();
  assert(s_alive && s_dictating && s_busy && fake_tick == tick);
  assert(fake_depth == 1 && !s_review[0]);
  assert(!s_dictation->confirmation && !s_dictation->error_dialogs);
}

static void finish(void) {
  window_stack_pop_all(false);
  deinit();
  s_dictation = NULL;
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
  assert(s_action_bar->background_color == GColorDarkCandyAppleRed);
  assert(s_icons[ICON_CONFIRM]->palette[0] == GColorClear &&
         s_icons[ICON_CONFIRM]->palette[1] == GColorWhite &&
         !s_icons[ICON_CONFIRM]->palette_owned);
  assert(s_icons[ICON_CONFIRM]->data[9] == 0x04 &&
         s_icons[ICON_CONFIRM]->data[20] == 0x07 &&
         s_icons[ICON_CONFIRM]->data[21] == 0x80);
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
  assert(s_review_text->layer.bounds.origin.y == fake_title_height + REVIEW_INSET);
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
  assert(!s_reviewed && s_review_text->layer.bounds.origin.y == 600 + REVIEW_INSET);
  int title_bottom = scroll_layer_get_content_size(s_scroll).h - s_scroll->layer.bounds.size.h;
  scroll_layer_set_content_offset(s_scroll, GPoint(0, -title_bottom + 1), false);
  assert(!s_reviewed);
  click(BUTTON_ID_DOWN);
  assert(s_reviewed && s_scroll->offset.y == -title_bottom);
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
  assert(s_scroll->offset.y == 0);
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
  puts("Watch lifecycle, native cancellation, correlated replies, timers and review tests passed.");
  return 0;
}
