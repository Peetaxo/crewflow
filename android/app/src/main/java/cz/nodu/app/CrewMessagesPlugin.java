package cz.nodu.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.text.TextUtils;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import org.json.JSONException;

@CapacitorPlugin(name = "CrewMessages")
public class CrewMessagesPlugin extends Plugin {
    @PluginMethod
    public void compose(PluginCall call) {
        JSArray recipients = call.getArray("recipients");
        if (recipients == null || recipients.length() == 0) {
            call.reject("Chybí telefonní čísla příjemců.");
            return;
        }
        try {
            List<String> numbers = recipients.toList();
            Uri address = Uri.fromParts("smsto", TextUtils.join(";", numbers), null);
            getActivity().startActivity(new Intent(Intent.ACTION_SENDTO, address));
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException error) {
            call.reject("Na tomto zařízení nelze otevřít aplikaci pro zprávy.", error);
        } catch (JSONException error) {
            call.reject("Telefonní čísla se nepodařilo načíst.", error);
        }
    }
}
