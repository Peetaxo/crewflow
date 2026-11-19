package cz.nodu.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "EventHoursFile")
public class EventHoursFilePlugin extends Plugin {
    private boolean pickerOpen;

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String base64 = call.getString("base64");
        if (filename == null || base64 == null || pickerOpen) {
            call.reject("Soubor s rozpisem hodin se nepodařilo připravit.");
            return;
        }

        File staged = null;
        try {
            staged = File.createTempFile("event-hours-", ".xlsx", getContext().getCacheDir());
            try (FileOutputStream output = new FileOutputStream(staged)) {
                output.write(Base64.decode(base64, Base64.DEFAULT));
            }
            // Capacitor persists pending activity calls in Android's size-limited saved state.
            call.getData().remove("base64");
            call.getData().put("stagedFile", staged.getName());

            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            pickerOpen = true;
            startActivityForResult(call, intent, "finishSave");
        } catch (IOException | RuntimeException error) {
            pickerOpen = false;
            if (staged != null) staged.delete();
            call.reject("Dialog pro uložení souboru se nepodařilo otevřít.", error);
        }
    }

    @ActivityCallback
    private void finishSave(PluginCall call, ActivityResult result) {
        bridge.execute(() -> {
            pickerOpen = false;
            if (call == null) return;
            File staged = new File(getContext().getCacheDir(), call.getString("stagedFile"));
            try {
                if (result.getResultCode() != Activity.RESULT_CANCELED) {
                    Intent data = result.getData();
                    Uri destination = data == null ? null : data.getData();
                    if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
                        throw new IOException("Missing document destination");
                    }
                    copyToDocument(staged, destination);
                }
                call.resolve();
            } catch (IOException | RuntimeException error) {
                call.reject("Soubor s rozpisem hodin se nepodařilo uložit.", error);
            } finally {
                staged.delete();
            }
        });
    }

    private void copyToDocument(File staged, Uri destination) throws IOException {
        try (FileInputStream input = new FileInputStream(staged);
             OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")) {
            if (output == null) throw new IOException("Document provider unavailable");
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
        }
    }
}
