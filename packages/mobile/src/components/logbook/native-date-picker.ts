// Thin wrapper around the Android imperative date/time dialog. On Android the
// picker is opened programmatically (there's no inline widget like iOS), and
// every call site has to remember to gate on `event.type === 'set'` so a
// dismissed dialog doesn't commit a value. Centralising that here keeps the
// three logbook date consumers — ClimbedAtField (create + edit) and the
// filter's DateRangeRow — consistent. iOS uses the inline `<DateTimePicker>`
// component directly and never calls this.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

type OpenAndroidDatePickerOptions = {
  value: Date;
  mode: 'date' | 'time';
  /** Fired only when the user confirms a value (dismiss is ignored). */
  onPicked: (picked: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
};

export function openAndroidDatePicker({
  value,
  mode,
  onPicked,
  maximumDate,
  minimumDate,
}: OpenAndroidDatePickerOptions) {
  DateTimePickerAndroid.open({
    value,
    mode,
    display: 'default',
    maximumDate,
    minimumDate,
    onChange: (event, picked) => {
      if (event.type !== 'set' || !picked) return;
      onPicked(picked);
    },
  });
}
