import {Command} from 'commander';

import glob from 'glob';
import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import {DateTime} from 'luxon';
import sizeOfImage from 'image-size';


import crypto from 'crypto';


import xmlbuilder from 'xmlbuilder2'

const program = new Command();
program.version("0.0.1")

program.arguments("<directory_path>")
    .description("Convert Google Keep exported from Google Takeout to Evernote XML Export", {
        directory_path: "Directory where Google Keep notes are stored"
    })
    .action((directory_path) => {

        let glob_pattern = path.resolve(process.cwd(), directory_path, "*.json");
        let json_files = glob.sync(glob_pattern);

        let notes = {};


        let root = xmlbuilder.create({
            version: '1.0',
            encoding: "UTF-8"
        });

        root.dtd({
            name: "en-export",
            sysID: "http://xml.evernote.com/pub/evernote-export4.dtd"
        })

        let currentExportDate = DateTime.utc();
        let currentExportDateString = currentExportDate.toFormat("yyyyMMdd'T'HHmmss'Z'");
        let root_element = root.ele('en-export', {
            'export-date': currentExportDateString,
            application: 'Evernote',
            version: '10.12.6'
        });


        _.each(json_files, (json_file) => {
            let json_data = fs.readFileSync(json_file, 'utf8');
            json_data = JSON.parse(json_data);
            let name = path.basename(json_file, '.json')
            _.set(notes, name, json_data);

            let title = _.get(json_data, 'title');
            let labels = _.get(json_data, 'labels');
            let annotations = _.get(json_data, 'annotations');
            let textContent = _.get(json_data, 'textContent');
            let listContent = _.get(json_data, 'listContent');
            let attachments = _.get(json_data, 'attachments');
            let userEditedTimestampUsec = _.get(json_data, 'userEditedTimestampUsec');

            let userEditedDate = DateTime.fromMillis(userEditedTimestampUsec / 1000).toUTC();
            let userEditedDateString = userEditedDate.toFormat("yyyyMMdd'T'HHmmss'Z'");


            let note_element = root_element.ele('note');


            let title_element = note_element.ele('title');


            if (!_.isEmpty(title)) {
                title_element.txt(title);
            } else {
                title_element.txt(userEditedDate.toFormat("dd MMM yyyy, HH:mm:ss"));
            }


            if (!_.isEmpty(textContent)) {

                let content_element = note_element.ele('content');

                let content_doc = xmlbuilder.create({
                    version: '1.0',
                    encoding: 'UTF-8',
                    standalone: false
                });
                content_doc.dtd({
                    name: 'en-note',
                    sysID: 'http://xml.evernote.com/pub/enml2.dtd'
                })
                let content_note_element = content_doc.ele('en-note');
                content_note_element.txt(textContent);


                if (!_.isEmpty(attachments)) {

                    _.each(attachments, (attachment) => {

                        let file_path = _.get(attachment, 'filePath');
                        if (file_path.endsWith('.jpeg')) {
                            file_path = file_path.replace(/\.jpeg$/, '.jpg');
                        }
                        let file_full_path = path.resolve(path.dirname(json_file), file_path);

                        let mime_type = _.get(attachment, 'mimetype');

                        let file_data = fs.readFileSync(file_full_path);
                        let file_base64_string = file_data.toString('base64').replace(/.{1,120}/g, '$&\n');


                        let hash = crypto.createHash('md5');
                        hash.update(file_data);
                        hash.digest('hex');
                        let hash_string = hash.toString();


                        content_note_element.ele('div').ele('en-media', {
                            type: mime_type,
                            width: '1024',
                            hash: hash_string
                        });


                        let resource_element = note_element.ele('resource');

                        resource_element.ele('data', {encoding: 'base64'}).txt(file_base64_string);
                        resource_element.ele('mime').txt(mime_type);

                        if (mime_type.startsWith('image')) {
                            let image_size = sizeOfImage(file_data);

                            resource_element.ele('width').txt(_.get(image_size, 'width'));
                            resource_element.ele('height').txt(_.get(image_size, 'height'));
                        }

                        resource_element.ele('resource-attributes')
                            .ele('file-name').txt(file_path);

                    });

                }

                content_element.dat(content_doc.end());

            } else if (!_.isEmpty(listContent)) {

                let content_element = note_element.ele('content');

                let content_doc = xmlbuilder.create({
                    version: '1.0',
                    encoding: 'UTF-8',
                    standalone: false
                });
                content_doc.dtd({
                    name: 'en-note',
                    sysID: 'http://xml.evernote.com/pub/enml2.dtd'
                })
                let content_note_element = content_doc.ele('en-note');
                let ul = content_note_element.ele('ul', {style: ""})

                _.each(listContent, function (listItem) {
                    let listItemText = _.get(listItem, 'text');
                    let listItemIsChecked = _.get(listItem, 'isChecked', false);

                    ul
                        .ele('li')
                        .ele('div')
                        .ele('en-todo', {
                            checked: listItemIsChecked ? "true" : "false"
                        })
                        .txt(listItemText);
                });


                content_note_element.txt(listContent);
                content_element.dat(content_doc.end());

            }

            if (!_.isEmpty(annotations)) {
                let note_attributes_element = note_element.ele('note-attributes');
                _.each(annotations, function (annotation) {
                    let annotation_source = _.get(annotation, 'source');
                    let annotation_url = _.get(annotation_source, 'url');
                    if (!_.isEmpty(annotation_url)) {
                        note_attributes_element.ele('source-url').txt(annotation_url);
                    }
                })
            }

            note_element.ele('created').txt(userEditedDateString);
            note_element.ele('updated').txt(userEditedDateString);

            if (!_.isEmpty(labels)) {
                _.each(labels, (label) => {
                    label = _.get(label, 'name');
                    note_element.ele('tag').txt(label);
                });
            }


        });

        let xml = root.end();

        fs.writeFileSync('./notes.enex', xml);
        //console.log(xml);

    });


program.parseAsync(process.argv).then(function () {
    process.exit(0);
})
