import { type RefObject, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { ActivityIndicator } from '../ActivityIndicator';
import { useComments, useAddComment } from '../../lib/graphql/hooks';
import { formatTickRelativeTime } from '@boardsesh/profile-stats';
import { hapticLight } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type CommentSheetProps = {
  sheetRef: RefObject<BottomSheet | null>;
  sessionId: string | null;
  onClose: () => void;
};

/** Comment thread for a session, with an inline composer. */
export function CommentSheet({ sheetRef, sessionId, onClose }: CommentSheetProps) {
  const { t } = useTranslation('you');
  const { systemColors } = useTheme();
  const [draft, setDraft] = useState('');

  const commentsQuery = useComments('session', sessionId ?? undefined, !!sessionId);
  const addComment = useAddComment();
  const comments = commentsQuery.data?.comments ?? [];

  const submit = () => {
    const body = draft.trim();
    if (!body || !sessionId) return;
    hapticLight();
    addComment.mutate({ entityType: 'session', entityId: sessionId, body });
    setDraft('');
  };

  return (
    <Sheet
      ref={sheetRef}
      snapPoints={['60%', '90%']}
      scrollable
      onClose={onClose}
      contentContainerStyle={styles.content}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      footer={
        <View style={styles.composer}>
          <BottomSheetTextInput
            style={[styles.input, { backgroundColor: systemColors.fill, color: systemColors.label as string }]}
            placeholder={t('mobile.comments.placeholder')}
            placeholderTextColor={systemColors.tertiaryLabel as string}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            onPress={submit}
            disabled={draft.trim().length === 0 || addComment.isPending}
            style={styles.send}
            accessibilityRole="button"
          >
            <Icon
              name="send"
              size={22}
              color={draft.trim().length > 0 ? brandColors.primary : systemColors.tertiaryLabel}
            />
          </Pressable>
        </View>
      }
    >
      <Text variant="title3" style={styles.title}>
        {t('mobile.comments.title')}
      </Text>
      {commentsQuery.isPending && sessionId ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : comments.length === 0 ? (
        <Text variant="subheadline" style={styles.empty}>
          {t('mobile.comments.empty')}
        </Text>
      ) : (
        comments.map((comment) => (
          <View key={comment.uuid} style={styles.commentRow}>
            <Avatar uri={comment.userAvatarUrl} name={comment.userDisplayName} size={32} />
            <View style={styles.commentBody}>
              <View style={styles.commentMeta}>
                <Text variant="subheadline" style={styles.commentName}>
                  {comment.userDisplayName ?? t('mobile.unknownName')}
                </Text>
                <Text variant="caption2" color={systemColors.tertiaryLabel}>
                  {formatTickRelativeTime(comment.createdAt)}
                </Text>
              </View>
              <Text variant="subheadline">{comment.body}</Text>
            </View>
          </View>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing[6] },
  title: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[3] },
  centered: { paddingVertical: spacing[10], alignItems: 'center' },
  empty: { paddingHorizontal: spacing[4], paddingVertical: spacing[6], opacity: 0.6 },
  commentRow: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  commentBody: { flex: 1, gap: 2 },
  commentMeta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
  commentName: { fontWeight: '600' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: 15,
  },
  send: { paddingBottom: spacing[2] },
});
